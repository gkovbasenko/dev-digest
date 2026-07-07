import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { Intent } from '@devdigest/shared';
import type { PullRow } from '../../../db/rows.js';
import type { PriorPrFileRow } from '../prior-prs/map.js';

// ---- PR lookup (workspace-scoped) -----------------------------------------

export async function getPull(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<PullRow | undefined> {
  const [row] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
  return row;
}

export async function getRepo(
  db: Db,
  repoId: string,
): Promise<typeof t.repos.$inferSelect | undefined> {
  const [row] = await db.select().from(t.repos).where(eq(t.repos.id, repoId));
  return row;
}

export async function getPrFiles(
  db: Db,
  prId: string,
): Promise<(typeof t.prFiles.$inferSelect)[]> {
  return db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
}

/**
 * Record the commit a review just ran against, so the PR list can derive
 * `reviewed` vs `needs_review` (head moved since the last review) vs `stale`.
 */
export async function markReviewed(db: Db, prId: string, sha: string): Promise<void> {
  await db
    .update(t.pullRequests)
    .set({ lastReviewedSha: sha })
    .where(eq(t.pullRequests.id, prId));
}

// ---- intent ---------------------------------------------------------------

export async function upsertIntent(db: Db, prId: string, intent: Intent): Promise<void> {
  await db
    .insert(t.prIntent)
    .values({
      prId,
      intent: intent.intent,
      inScope: intent.in_scope,
      outOfScope: intent.out_of_scope,
    })
    .onConflictDoUpdate({
      target: t.prIntent.prId,
      set: { intent: intent.intent, inScope: intent.in_scope, outOfScope: intent.out_of_scope },
    });
}

export async function getIntent(db: Db, prId: string): Promise<Intent | undefined> {
  const [row] = await db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
  if (!row) return undefined;
  return { intent: row.intent, in_scope: row.inScope, out_of_scope: row.outOfScope };
}

// ---- prior PRs (blast: "prior PRs touching these files") ------------------

/**
 * Two bounded queries, no N+1: `pr_files` <-> `pull_requests`, scoped to the
 * same repo, excluding the current PR, restricted to merged PRs, filtered to
 * only the paths this PR changed. Returns one row per (prior PR, overlapping
 * file); grouping happens in `groupPriorPrRows` (pure, unit-tested separately).
 *
 * Step 1 caps the CANDIDATE PR set in SQL to the `limit` most-recently-updated
 * merged PRs that touch any changed path. Without this a "hot" changed path
 * (a lockfile, `package.json`) could join to thousands of (PR x file) rows
 * before the in-memory cap in `groupPriorPrRows` ever applies. Step 2 then
 * fetches EVERY overlapping file for only those survivors, so each PR's
 * `files_overlap` count stays complete (a naive SQL `LIMIT` on the joined rows
 * would truncate a PR's overlap list mid-PR).
 */
export async function getPriorPrRows(
  db: Db,
  repoId: string,
  excludePrId: string,
  changedFiles: string[],
  limit: number,
): Promise<PriorPrFileRow[]> {
  // Step 1: the `limit` most-recent merged PRs overlapping the changed paths.
  const candidates = await db
    .selectDistinct({
      id: t.pullRequests.id,
      updatedAt: t.pullRequests.updatedAt,
    })
    .from(t.pullRequests)
    .innerJoin(t.prFiles, eq(t.prFiles.prId, t.pullRequests.id))
    .where(
      and(
        eq(t.pullRequests.repoId, repoId),
        ne(t.pullRequests.id, excludePrId),
        eq(t.pullRequests.status, 'merged'),
        inArray(t.prFiles.path, changedFiles),
      ),
    )
    .orderBy(sql`${t.pullRequests.updatedAt} desc nulls last`)
    .limit(limit);

  const candidateIds = candidates.map((c) => c.id);
  if (candidateIds.length === 0) return [];

  // Step 2: all overlapping files for ONLY those capped PRs.
  return db
    .select({
      prId: t.pullRequests.id,
      number: t.pullRequests.number,
      title: t.pullRequests.title,
      author: t.pullRequests.author,
      updatedAt: t.pullRequests.updatedAt,
      path: t.prFiles.path,
    })
    .from(t.prFiles)
    .innerJoin(t.pullRequests, eq(t.prFiles.prId, t.pullRequests.id))
    .where(
      and(
        inArray(t.pullRequests.id, candidateIds),
        inArray(t.prFiles.path, changedFiles),
      ),
    );
}
