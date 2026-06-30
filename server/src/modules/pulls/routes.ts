import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { and, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import type { PrMeta, PrDetail, GitHubClient, PrReviewComment } from '@devdigest/shared';
import { PrCommentInput } from '@devdigest/shared';
import * as t from '../../db/schema.js';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { deriveReviewStatus } from './status.js';
import { excerptRationale, RATIONALE_EXCERPT_LEN } from './helpers.js';
import { estimateCost } from '../../adapters/llm/pricing.js';

/**
 * F1 — pulls module. PR import via Octokit (list + per-PR detail).
 *   GET /repos/:id/pulls → list PRs for a repo (open + recently merged/closed,
 *                          synced from GitHub, persisted). `status` is GitHub's
 *                          merge state (open/merged/closed).
 *   GET /pulls/:id       → full PR detail (diff/files, commits, body, linked issue)
 *
 * Import is idempotent (unique repo_id+number). Review trigger is MANUAL
 * and owned by A2 — this module only imports/reads.
 */
export default async function pullsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.get('/repos/:id/pulls', { schema: { params: IdParams } }, async (req): Promise<PrMeta[]> => {
    const { workspaceId } = await getContext(container, req);
    const [repo] = await container.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, req.params.id)));
    if (!repo) throw new NotFoundError('Repo not found');

    let gh: GitHubClient | null = null;
    try {
      gh = await container.github();
    } catch (err) {
      app.log.warn({ err }, 'GitHub client unavailable (no token / offline); serving persisted PRs');
    }

    // Local-first: sync from GitHub when a token is configured, but never
    // fail the read — already-imported/seeded PRs stay viewable offline.
    if (gh) {
      try {
        const pulls = await gh.listPullRequests({ owner: repo.owner, name: repo.name });
        for (const pr of pulls) {
          await container.db
            .insert(t.pullRequests)
            .values({
              workspaceId,
              repoId: repo.id,
              number: pr.number,
              title: pr.title,
              author: pr.author,
              branch: pr.branch,
              base: pr.base,
              headSha: pr.head_sha,
              additions: pr.additions,
              deletions: pr.deletions,
              filesCount: pr.files_count,
              status: pr.status,
              openedAt: pr.opened_at ? new Date(pr.opened_at) : null,
              updatedAt: pr.updated_at ? new Date(pr.updated_at) : null,
            })
            .onConflictDoUpdate({
              target: [t.pullRequests.repoId, t.pullRequests.number],
              set: {
                title: pr.title,
                headSha: pr.head_sha,
                status: pr.status,
                updatedAt: pr.updated_at ? new Date(pr.updated_at) : null,
              },
            });
        }
      } catch (err) {
        app.log.warn({ err }, 'GitHub PR sync skipped (no token / offline); serving persisted PRs');
      }
    }

    const rows = await container.db
      .select()
      .from(t.pullRequests)
      .where(eq(t.pullRequests.repoId, repo.id));

    // Diff stats aren't on GitHub's PR-list payload, so freshly-imported PRs
    // land with zeroed size/diff. Backfill them once from the detail endpoint
    // so the list shows real S/M/L + ± counts. Capped per request (each backfill
    // is a detail fetch) — the periodic refetch chips away at any remainder.
    const BACKFILL_LIMIT = 10;
    if (gh) {
      const needStats = rows
        .filter((r) => r.additions === 0 && r.deletions === 0 && r.filesCount === 0)
        .slice(0, BACKFILL_LIMIT);
      for (const r of needStats) {
        try {
          const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, r.number);
          await container.db
            .update(t.pullRequests)
            .set({
              additions: detail.additions,
              deletions: detail.deletions,
              filesCount: detail.files_count,
            })
            .where(eq(t.pullRequests.id, r.id));
          r.additions = detail.additions;
          r.deletions = detail.deletions;
          r.filesCount = detail.files_count;
        } catch (err) {
          app.log.warn({ err, number: r.number }, 'PR diff-stat backfill skipped');
        }
      }
    }

    // SCORE: from the latest review per PR (one number, most meaningful).
    // FINDINGS: aggregated across ALL reviews on the PR — matches what the
    // detail page shows (each agent run creates its own review record; old runs
    // are not deleted on re-run, so the latest review alone can mask findings
    // from prior runs). Dismissed findings are excluded.
    const prIds = rows.map((r) => r.id);
    const latestReviewByPr = new Map<string, { score: number | null }>();
    if (prIds.length > 0) {
      const reviewRows = await container.db
        .select({ prId: t.reviews.prId, score: t.reviews.score })
        .from(t.reviews)
        .where(and(inArray(t.reviews.prId, prIds), eq(t.reviews.kind, 'review')))
        .orderBy(desc(t.reviews.createdAt));
      // Rows are newest-first → first seen per PR is the latest review.
      for (const rv of reviewRows) {
        if (!latestReviewByPr.has(rv.prId)) {
          latestReviewByPr.set(rv.prId, { score: rv.score });
        }
      }
    }

    const findingsBySeverityByPr = new Map<
      string,
      { CRITICAL: number; WARNING: number; SUGGESTION: number }
    >();
    type TopFinding = {
      id: string;
      severity: 'CRITICAL' | 'WARNING' | 'SUGGESTION';
      category: string;
      title: string;
      file: string;
      start_line: number;
      end_line: number;
      confidence: number;
      rationale_excerpt: string;
    };
    const topFindingsByPr = new Map<string, TopFinding[]>();
    const TOP_FINDINGS_PER_PR = 5;
    if (latestReviewByPr.size > 0) {
      // Aggregate by pr_id (joined via review_id → reviews.pr_id), excluding
      // dismissed findings and non-review rows (e.g., kind='summary').
      const findingRows = await container.db
        .select({
          prId: t.reviews.prId,
          severity: t.findings.severity,
          count: sql<number>`count(*)::int`,
        })
        .from(t.findings)
        .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
        .where(
          and(
            inArray(t.reviews.prId, prIds),
            eq(t.reviews.kind, 'review'),
            isNull(t.findings.dismissedAt),
          ),
        )
        .groupBy(t.reviews.prId, t.findings.severity);
      for (const f of findingRows) {
        const bucket =
          findingsBySeverityByPr.get(f.prId) ??
          ({ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 } as const);
        const next = { ...bucket };
        if (f.severity === 'CRITICAL' || f.severity === 'WARNING' || f.severity === 'SUGGESTION') {
          next[f.severity] = f.count;
        }
        findingsBySeverityByPr.set(f.prId, next);
      }

      // Top finding rows for the hover preview.
      // Phase 1: ROW_NUMBER() CTE without rationale — avoids reading the
      // potentially-long text column for rows that will be discarded by the
      // window filter. Only id/metadata is transferred for all candidates.
      const sevOrderExpr = sql`case ${t.findings.severity}
        when 'CRITICAL' then 0
        when 'WARNING' then 1
        when 'SUGGESTION' then 2
        else 3 end`;
      const ranked = container.db.$with('top_findings_ranked').as(
        container.db
          .select({
            id: t.findings.id,
            prId: t.reviews.prId,
            severity: t.findings.severity,
            category: t.findings.category,
            title: t.findings.title,
            file: t.findings.file,
            startLine: t.findings.startLine,
            endLine: t.findings.endLine,
            confidence: t.findings.confidence,
            rn: sql<number>`ROW_NUMBER() OVER (
              PARTITION BY ${t.reviews.prId}
              ORDER BY ${sevOrderExpr}, ${t.findings.file}, ${t.findings.startLine}
            )`.as('rn'),
          })
          .from(t.findings)
          .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
          .where(
            and(
              inArray(t.reviews.prId, prIds),
              eq(t.reviews.kind, 'review'),
              isNull(t.findings.dismissedAt),
            ),
          ),
      );
      const topRows = await container.db
        .with(ranked)
        .select({
          id: ranked.id,
          prId: ranked.prId,
          severity: ranked.severity,
          category: ranked.category,
          title: ranked.title,
          file: ranked.file,
          startLine: ranked.startLine,
          endLine: ranked.endLine,
          confidence: ranked.confidence,
        })
        .from(ranked)
        .where(sql`${ranked.rn} <= ${TOP_FINDINGS_PER_PR}`);

      // Phase 2: fetch rationale only for the winning top-5 finding IDs.
      const topIds = topRows.map((r) => r.id);
      const rationaleMap = new Map<string, string>();
      if (topIds.length > 0) {
        const rationaleRows = await container.db
          .select({ id: t.findings.id, rationale: t.findings.rationale })
          .from(t.findings)
          .where(inArray(t.findings.id, topIds));
        for (const r of rationaleRows) rationaleMap.set(r.id, r.rationale);
      }

      for (const f of topRows) {
        if (f.severity !== 'CRITICAL' && f.severity !== 'WARNING' && f.severity !== 'SUGGESTION') {
          continue;
        }
        const list = topFindingsByPr.get(f.prId) ?? [];
        list.push({
          id: f.id,
          severity: f.severity,
          category: f.category,
          title: f.title,
          file: f.file,
          start_line: f.startLine,
          end_line: f.endLine,
          confidence: f.confidence,
          rationale_excerpt: excerptRationale(rationaleMap.get(f.id) ?? ''),
        });
        topFindingsByPr.set(f.prId, list);
      }
    }

    const latestRunCostByPr = new Map<string, number>();
    if (prIds.length > 0) {
      // DISTINCT ON (pr_id) ORDER BY pr_id, ran_at DESC — one row per PR (the latest
      // completed run that has cost data). Filtering nulls in SQL avoids fetching all
      // completed runs and sorting them in the application as run count grows.
      // estimateCost is a pure dict lookup — must stay O(1)/no-I/O for this to be safe.
      const runRows = await container.db
        .selectDistinctOn([t.agentRuns.prId], {
          prId: t.agentRuns.prId,
          model: t.agentRuns.model,
          tokensIn: t.agentRuns.tokensIn,
          tokensOut: t.agentRuns.tokensOut,
        })
        .from(t.agentRuns)
        .where(
          and(
            inArray(t.agentRuns.prId, prIds),
            eq(t.agentRuns.status, 'done'),
            isNotNull(t.agentRuns.model),
            isNotNull(t.agentRuns.tokensIn),
            isNotNull(t.agentRuns.tokensOut),
          ),
        )
        .orderBy(t.agentRuns.prId, desc(t.agentRuns.ranAt));
      for (const run of runRows) {
        if (!run.prId || !run.model || run.tokensIn == null || run.tokensOut == null) continue;
        const cost = estimateCost(run.model, run.tokensIn, run.tokensOut);
        if (cost !== null) latestRunCostByPr.set(run.prId, cost);
      }
    }

    const now = Date.now();
    return rows.map((r) => {
      const review = latestReviewByPr.get(r.id);
      return {
        id: r.id,
        number: r.number,
        title: r.title,
        author: r.author,
        branch: r.branch,
        base: r.base,
        head_sha: r.headSha,
        additions: r.additions,
        deletions: r.deletions,
        files_count: r.filesCount,
        status: deriveReviewStatus({
          ghStatus: r.status,
          lastReviewedSha: r.lastReviewedSha,
          headSha: r.headSha,
          updatedAt: r.updatedAt,
          now,
        }),
        opened_at: r.openedAt?.toISOString() ?? null,
        updated_at: r.updatedAt?.toISOString() ?? null,
        score: review ? review.score : null,
        last_run_cost_usd: latestRunCostByPr.get(r.id) ?? null,
        findings_by_severity: review
          ? findingsBySeverityByPr.get(r.id) ?? {
              CRITICAL: 0,
              WARNING: 0,
              SUGGESTION: 0,
            }
          : null,
        top_findings: review ? topFindingsByPr.get(r.id) ?? [] : null,
      };
    });
  });

  app.get('/pulls/:id', { schema: { params: IdParams } }, async (req): Promise<PrDetail> => {
    const { workspaceId } = await getContext(container, req);
    const [pr] = await container.db
      .select()
      .from(t.pullRequests)
      .where(
        and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, req.params.id)),
      );
    if (!pr) throw new NotFoundError('Pull request not found');
    const [repo] = await container.db
      .select()
      .from(t.repos)
      .where(eq(t.repos.id, pr.repoId));
    if (!repo) throw new NotFoundError('Repo not found');

    // Local-first: refresh detail from GitHub when a token is configured;
    // otherwise serve the persisted files/commits/body (seeded or previously
    // imported) so PR detail works offline.
    try {
      const gh = await container.github();
      const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, pr.number);

      await container.db.delete(t.prFiles).where(eq(t.prFiles.prId, pr.id));
      if (detail.files.length > 0) {
        await container.db.insert(t.prFiles).values(
          detail.files.map((f) => ({
            prId: pr.id,
            path: f.path,
            additions: f.additions,
            deletions: f.deletions,
            patch: f.patch ?? null,
          })),
        );
      }
      await container.db.delete(t.prCommits).where(eq(t.prCommits.prId, pr.id));
      if (detail.commits.length > 0) {
        await container.db.insert(t.prCommits).values(
          detail.commits.map((c) => ({
            prId: pr.id,
            sha: c.sha,
            message: c.message,
            author: c.author,
            committedAt: c.committed_at ? new Date(c.committed_at) : null,
          })),
        );
      }
      await container.db
        .update(t.pullRequests)
        .set({
          body: detail.body ?? null,
          // Diff stats aren't on GitHub's PR-list payload — backfill them from
          // the detail fetch so the Pull Requests list shows real size/files.
          additions: detail.additions,
          deletions: detail.deletions,
          filesCount: detail.files_count,
        })
        .where(eq(t.pullRequests.id, pr.id));

      return { ...detail, id: pr.id };
    } catch (err) {
      app.log.warn({ err }, 'GitHub PR detail refresh skipped (no token / offline); serving persisted detail');
      const files = await container.db.select().from(t.prFiles).where(eq(t.prFiles.prId, pr.id));
      const commits = await container.db.select().from(t.prCommits).where(eq(t.prCommits.prId, pr.id));
      return {
        id: pr.id,
        number: pr.number,
        title: pr.title,
        author: pr.author,
        branch: pr.branch,
        base: pr.base,
        head_sha: pr.headSha,
        additions: pr.additions,
        deletions: pr.deletions,
        files_count: pr.filesCount,
        status: pr.status as PrDetail['status'],
        opened_at: pr.openedAt?.toISOString() ?? null,
        updated_at: pr.updatedAt?.toISOString() ?? null,
        body: pr.body ?? null,
        files: files.map((f) => ({
          path: f.path,
          additions: f.additions,
          deletions: f.deletions,
          patch: f.patch ?? null,
        })),
        commits: commits.map((c) => ({
          sha: c.sha,
          message: c.message,
          author: c.author,
          committed_at: c.committedAt?.toISOString() ?? null,
        })),
      };
    }
  });

  // ---- Inline review comments (Files changed tab) -------------------------
  // Proxied live to GitHub (no local persistence): GET reflects existing PR
  // comments; POST creates one immediately. Keeps the tab in lock-step with
  // GitHub and avoids a stale local mirror.
  async function resolvePrAndRepo(id: string, workspaceId: string) {
    const [pr] = await container.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, id)));
    if (!pr) throw new NotFoundError('Pull request not found');
    const [repo] = await container.db.select().from(t.repos).where(eq(t.repos.id, pr.repoId));
    if (!repo) throw new NotFoundError('Repo not found');
    return { pr, repo };
  }

  app.get(
    '/pulls/:id/comments',
    { schema: { params: IdParams } },
    async (req): Promise<PrReviewComment[]> => {
      const { workspaceId } = await getContext(container, req);
      const { pr, repo } = await resolvePrAndRepo(req.params.id, workspaceId);
      let gh: GitHubClient;
      try {
        gh = await container.github();
      } catch (err) {
        app.log.warn({ err }, 'GitHub client unavailable; serving no PR comments');
        return [];
      }
      try {
        return await gh.listReviewComments({ owner: repo.owner, name: repo.name }, pr.number);
      } catch (err) {
        app.log.warn({ err }, 'GitHub review-comments fetch skipped (offline / error)');
        return [];
      }
    },
  );

  app.post(
    '/pulls/:id/comments',
    { schema: { params: IdParams, body: PrCommentInput } },
    async (req): Promise<PrReviewComment> => {
      const { workspaceId } = await getContext(container, req);
      const { pr, repo } = await resolvePrAndRepo(req.params.id, workspaceId);
      const input = req.body;
      let gh: GitHubClient;
      try {
        gh = await container.github();
      } catch {
        throw new AppError(
          'github_unavailable',
          'Connect a GitHub token to post comments.',
          400,
        );
      }
      try {
        return await gh.createReviewComment({ owner: repo.owner, name: repo.name }, pr.number, {
          commitId: pr.headSha,
          path: input.path,
          line: input.line,
          ...(input.side ? { side: input.side } : {}),
          body: input.body,
          ...(input.in_reply_to != null ? { inReplyTo: input.in_reply_to } : {}),
        });
      } catch (err) {
        // GitHub rejects comments on lines outside the diff / on closed PRs (422).
        const msg = err instanceof Error ? err.message : 'Failed to post the comment to GitHub.';
        throw new AppError('github_comment_failed', msg, 400, { cause: String(err) });
      }
    },
  );
}
