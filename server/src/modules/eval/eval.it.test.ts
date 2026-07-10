import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from '../../../test/helpers/pg.js';
import { buildApp } from '../../app.js';
import { loadConfig } from '../../platform/config.js';
import { seed } from '../../db/seed.js';
import { MockLLMProvider } from '../../adapters/mocks.js';
import * as t from '../../db/schema.js';
import type { GitClient, GitHubClient, Review } from '@devdigest/shared';
import type { RepoIntel } from '../repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/** A diff touching src/config.ts (lines 10-11 added) — same shape used to
 *  freeze eval_cases.input_diff so scoring can ground against a real hunk. */
const PATCH = '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,';

/** A Review fixture with exactly one finding on the changed line (11). */
const REVIEW_FIXTURE: Review = {
  verdict: 'request_changes',
  summary: 'Hardcoded Stripe secret introduced.',
  score: 42,
  findings: [
    {
      id: 'f-valid',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe secret key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A live Stripe key is committed in source.',
      suggestion: 'Move the key to an environment variable.',
      confidence: 0.95,
      kind: 'finding',
    },
  ],
};

/** Every method throws — proves an eval run never reaches this adapter (AC-7). */
function forbiddenAdapter<T extends object>(name: string): T {
  return new Proxy({} as T, {
    get(_t, prop) {
      return (..._args: unknown[]) => {
        throw new Error(`${name}.${String(prop)} must never be called by an eval run (AC-7)`);
      };
    },
  });
}

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `payments-api-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 482,
      title: 'Add rate limiting',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
    })
    .returning();
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/config.ts',
    additions: 1,
    deletions: 0,
    patch: PATCH,
  });
  return { repo: repo!, pr: pr! };
}

/** Insert a review + one finding directly (bypasses the reviewer pipeline —
 *  this test only needs a persisted finding to "Turn into eval case"). */
async function insertReviewAndFinding(
  db: PgFixture['handle']['db'],
  workspaceId: string,
  prId: string,
  agentId: string | null,
  action: 'accept' | 'dismiss',
) {
  const [review] = await db
    .insert(t.reviews)
    .values({
      workspaceId,
      prId,
      agentId,
      runId: null,
      kind: 'review',
      verdict: 'request_changes',
      summary: 's',
      score: 42,
      model: 'gpt-4.1',
    })
    .returning();
  const [finding] = await db
    .insert(t.findings)
    .values({
      reviewId: review!.id,
      file: 'src/config.ts',
      startLine: 11,
      endLine: 11,
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe secret key',
      rationale: 'r',
      confidence: 0.95,
      kind: 'finding',
      acceptedAt: action === 'accept' ? new Date() : null,
      dismissedAt: action === 'dismiss' ? new Date() : null,
    })
    .returning();
  return { review: review!, finding: finding! };
}

d('A4 eval module (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function appWith(structured: unknown = REVIEW_FIXTURE) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        llm: { openai: new MockLLMProvider('openai', { structured }) },
        // AC-7: an eval run must NEVER call these — proxies throw if touched.
        git: forbiddenAdapter<GitClient>('container.git'),
        github: forbiddenAdapter<GitHubClient>('container.github'),
        repoIntel: forbiddenAdapter<RepoIntel>('container.repoIntel'),
      },
    });
  }

  async function createAgent(app: Awaited<ReturnType<typeof appWith>>) {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name: 'Sec', provider: 'openai', model: 'gpt-4.1', system_prompt: 'sec' },
    });
    return res.json();
  }

  it('AC-1..AC-3: creates a must_find eval case from an accepted finding, frozen from pr_files', async () => {
    const app = await appWith();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = await createAgent(app);
    const { finding } = await insertReviewAndFinding(pg.handle.db, workspaceId, pr.id, agent.id, 'accept');

    const res = await app.inject({ method: 'POST', url: `/findings/${finding.id}/eval-case` });
    expect(res.statusCode).toBe(201);
    const evalCase = res.json();
    expect(evalCase.owner_kind).toBe('agent');
    expect(evalCase.owner_id).toBe(agent.id);
    expect(evalCase.source_finding_id).toBe(finding.id);
    expect(evalCase.expected_output.must_find).toEqual([
      { file: 'src/config.ts', start_line: 11, end_line: 11, severity: 'CRITICAL', category: 'security', title: 'Hardcoded Stripe secret key' },
    ]);
    expect(evalCase.expected_output.must_not_flag).toEqual([]);
    // frozen from pr_files — contains the same patch text, no live fetch.
    expect(evalCase.input_diff).toContain('stripeKey');

    // de-dupe: a re-click on the same finding returns the SAME case.
    const again = await app.inject({ method: 'POST', url: `/findings/${finding.id}/eval-case` });
    expect(again.json().id).toBe(evalCase.id);

    const list = await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-cases` });
    expect(list.json()).toHaveLength(1);

    await app.close();
  });

  it('AC-2: creates a must_not_flag eval case from a dismissed finding', async () => {
    const app = await appWith();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = await createAgent(app);
    const { finding } = await insertReviewAndFinding(pg.handle.db, workspaceId, pr.id, agent.id, 'dismiss');

    const res = await app.inject({ method: 'POST', url: `/findings/${finding.id}/eval-case` });
    expect(res.statusCode).toBe(201);
    const evalCase = res.json();
    expect(evalCase.expected_output.must_find).toEqual([]);
    expect(evalCase.expected_output.must_not_flag).toEqual([
      { file: 'src/config.ts', start_line: 11, end_line: 11 },
    ]);

    await app.close();
  });

  it('AC-4: 400 when the finding\'s review has no agent', async () => {
    const app = await appWith();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const { finding } = await insertReviewAndFinding(pg.handle.db, workspaceId, pr.id, null, 'accept');

    const res = await app.inject({ method: 'POST', url: `/findings/${finding.id}/eval-case` });
    expect(res.statusCode).toBe(400);

    await app.close();
  });

  it('AC-7/AC-8: whole-set run persists exactly ONE eval_runs row scored from the frozen diff, never touching git/github/repoIntel', async () => {
    const app = await appWith();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = await createAgent(app);
    const { finding } = await insertReviewAndFinding(pg.handle.db, workspaceId, pr.id, agent.id, 'accept');
    await app.inject({ method: 'POST', url: `/findings/${finding.id}/eval-case` });

    const res = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.run_id).toBeTruthy();
    expect(body.result.case_results).toHaveLength(1);
    expect(body.result.traces_passed).toBe(1);
    expect(body.result.traces_total).toBe(1);
    expect(body.result.recall).toBe(1);
    expect(body.result.precision).toBe(1);
    expect(body.result.citation_accuracy).toBe(1);

    const rows = await pg.handle.db.select().from(t.evalRuns).where(eq(t.evalRuns.ownerId, agent.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.ownerVersion).toBe(agent.version);
    expect((rows[0]!.caseResults as unknown[]).length).toBe(1);

    await app.close();
  });

  it('determinism: two runs of the same frozen set + fixture produce identical aggregate metrics', async () => {
    const app = await appWith();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = await createAgent(app);
    const { finding } = await insertReviewAndFinding(pg.handle.db, workspaceId, pr.id, agent.id, 'accept');
    await app.inject({ method: 'POST', url: `/findings/${finding.id}/eval-case` });

    const run1 = (await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` })).json();
    const run2 = (await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` })).json();

    expect(run1.run_id).not.toBe(run2.run_id);
    expect(run2.result.recall).toBe(run1.result.recall);
    expect(run2.result.precision).toBe(run1.result.precision);
    expect(run2.result.citation_accuracy).toBe(run1.result.citation_accuracy);
    expect(run2.result.traces_passed).toBe(run1.result.traces_passed);
    expect(run2.result.traces_total).toBe(run1.result.traces_total);

    const runs = await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-runs` });
    expect(runs.json()).toHaveLength(2);

    await app.close();
  });

  it('AC-21: single-case run via POST /eval-cases/:id/run', async () => {
    const app = await appWith();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = await createAgent(app);
    const { finding } = await insertReviewAndFinding(pg.handle.db, workspaceId, pr.id, agent.id, 'accept');
    const evalCase = (
      await app.inject({ method: 'POST', url: `/findings/${finding.id}/eval-case` })
    ).json();

    const res = await app.inject({ method: 'POST', url: `/eval-cases/${evalCase.id}/run` });
    expect(res.statusCode).toBe(200);
    expect(res.json().result.case_results).toHaveLength(1);

    await app.close();
  });

  it('empty set → 400, no eval_runs row persisted', async () => {
    const app = await appWith();
    const agent = await createAgent(app);

    const res = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` });
    expect(res.statusCode).toBe(400);

    const rows = await pg.handle.db.select().from(t.evalRuns).where(eq(t.evalRuns.ownerId, agent.id));
    expect(rows).toHaveLength(0);

    await app.close();
  });

  it('a malformed frozen diff fails that case closed (no LLM call attempted)', async () => {
    const app = await appWith();
    const agent = await createAgent(app);
    // Directly create a case with an unparseable input_diff via PUT after an empty POST is not
    // available — go through create-from-finding then corrupt input_diff via PUT.
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const { finding } = await insertReviewAndFinding(pg.handle.db, workspaceId, pr.id, agent.id, 'accept');
    const evalCase = (
      await app.inject({ method: 'POST', url: `/findings/${finding.id}/eval-case` })
    ).json();
    await app.inject({
      method: 'PUT',
      url: `/eval-cases/${evalCase.id}`,
      payload: { input_diff: 'not a real diff' },
    });

    const res = await app.inject({ method: 'POST', url: `/eval-cases/${evalCase.id}/run` });
    expect(res.statusCode).toBe(200);
    const result = res.json().result.case_results[0];
    expect(result.pass).toBe(false);
    expect(result.got).toBe(0);

    await app.close();
  });

  it('dashboard: workspace-level lists the agent card; agent-detail shows the latest run', async () => {
    const app = await appWith();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = await createAgent(app);
    const { finding } = await insertReviewAndFinding(pg.handle.db, workspaceId, pr.id, agent.id, 'accept');
    await app.inject({ method: 'POST', url: `/findings/${finding.id}/eval-case` });
    await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` });

    const workspaceDash = (await app.inject({ method: 'GET', url: '/eval/dashboard' })).json();
    expect(workspaceDash.agents.some((a: { agent_id: string }) => a.agent_id === agent.id)).toBe(true);

    const detail = (
      await app.inject({ method: 'GET', url: `/eval/dashboard?agentId=${agent.id}` })
    ).json();
    expect(detail.owner_id).toBe(agent.id);
    expect(detail.cases_total).toBe(1);
    expect(detail.current.traces_total).toBe(1);
    expect(detail.recent_runs).toHaveLength(1);

    await app.close();
  });
});
