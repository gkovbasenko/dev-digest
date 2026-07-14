import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import type { Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/** Same fixture shape as reviews.it.test.ts — a diff touching src/config.ts. */
const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

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

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `multi-agent-repo-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 900 + repoSeq,
      title: 'Add rate limiting',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      body: 'Add rate limiting.',
    })
    .returning();
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/config.ts',
    additions: 1,
    deletions: 0,
    patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
  });
  return { repo: repo!, pr: pr! };
}

d('T6 multi-agent grouping (Testcontainers pg)', () => {
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
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: new MockLLMProvider('openai', { structured }) },
      },
    });
  }

  async function createAgent(app: Awaited<ReturnType<typeof appWith>>, name: string, extra: Record<string, unknown> = {}) {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name, provider: 'openai', model: 'gpt-4.1', system_prompt: 's', ...extra },
    });
    return res.json();
  }

  it('AC-12/AC-18/AC-33: a 3-agent trigger creates one group + 3 linked agent_runs, returns run_ids immediately, and read carries per-column agent_id', async () => {
    const app = await appWith();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const agents = await Promise.all([
      createAgent(app, 'MA Agent 1'),
      createAgent(app, 'MA Agent 2'),
      createAgent(app, 'MA Agent 3'),
    ]);
    const agentIds = agents.map((a) => a.id);

    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/multi-agent-run`,
      payload: { agentIds },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // AC-18: every run_id is returned immediately, before reviews are persisted.
    expect(body.runs).toHaveLength(3);
    expect(body.multi_agent_run_id).toBeTruthy();
    const reviewsBeforeCompletion = await pg.handle.db
      .select()
      .from(t.reviews)
      .where(eq(t.reviews.prId, pr.id));
    expect(reviewsBeforeCompletion).toHaveLength(0);

    // AC-12: one multi_agent_runs row + 3 agent_runs all carrying its id.
    const groupRows = await pg.handle.db
      .select()
      .from(t.multiAgentRuns)
      .where(eq(t.multiAgentRuns.id, body.multi_agent_run_id));
    expect(groupRows).toHaveLength(1);
    const linkedRuns = await pg.handle.db
      .select()
      .from(t.agentRuns)
      .where(eq(t.agentRuns.multiAgentRunId, body.multi_agent_run_id));
    expect(linkedRuns).toHaveLength(3);

    await waitForPrRuns(pg.handle.db, pr.id, { expected: 3, timeoutMs: 20_000 });

    // AC-13: GET /pulls/:id/multi-agent validates against the MultiAgentRun shape.
    const read = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/multi-agent` })).json();
    expect(read.id).toBe(body.multi_agent_run_id);
    expect(read.pr_id).toBe(pr.id);
    expect(read.agent_count).toBe(3);
    expect(read.columns).toHaveLength(3);
    for (const col of read.columns) {
      expect(agentIds).toContain(col.agent_id);
      expect(col.status).toBe('done');
      expect(typeof col.duration_ms === 'number' || col.duration_ms === null).toBe(true);
    }

    // AC-33: every persisted finding's review carries the correct agent_id.
    const reviews = await pg.handle.db.select().from(t.reviews).where(eq(t.reviews.prId, pr.id));
    expect(reviews).toHaveLength(3);
    for (const review of reviews) {
      expect(agentIds).toContain(review.agentId);
    }

    await app.close();
  });

  it('AC-14: two groups on the same PR — read returns the most-recent group by ran_at', async () => {
    const app = await appWith();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = await createAgent(app, 'MA Solo');

    const first = (
      await app.inject({
        method: 'POST',
        url: `/pulls/${pr.id}/multi-agent-run`,
        payload: { agentIds: [agent.id] },
      })
    ).json();
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1, timeoutMs: 20_000 });

    const second = (
      await app.inject({
        method: 'POST',
        url: `/pulls/${pr.id}/multi-agent-run`,
        payload: { agentIds: [agent.id] },
      })
    ).json();
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 2, timeoutMs: 20_000 });

    expect(second.multi_agent_run_id).not.toBe(first.multi_agent_run_id);

    const groups = await pg.handle.db
      .select()
      .from(t.multiAgentRuns)
      .where(eq(t.multiAgentRuns.prId, pr.id));
    expect(groups).toHaveLength(2);

    const read = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/multi-agent` })).json();
    expect(read.id).toBe(second.multi_agent_run_id);

    await app.close();
  });

  it('AC-15: a second group can be triggered before the first completes — both persist with disjoint agent_runs', async () => {
    const app = await appWith();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agentA = await createAgent(app, 'MA A');
    const agentB = await createAgent(app, 'MA B');

    const [groupA, groupB] = await Promise.all([
      app
        .inject({ method: 'POST', url: `/pulls/${pr.id}/multi-agent-run`, payload: { agentIds: [agentA.id] } })
        .then((r) => r.json()),
      app
        .inject({ method: 'POST', url: `/pulls/${pr.id}/multi-agent-run`, payload: { agentIds: [agentB.id] } })
        .then((r) => r.json()),
    ]);

    expect(groupA.multi_agent_run_id).not.toBe(groupB.multi_agent_run_id);

    await waitForPrRuns(pg.handle.db, pr.id, { expected: 2, timeoutMs: 20_000 });

    const runsA = await pg.handle.db
      .select()
      .from(t.agentRuns)
      .where(eq(t.agentRuns.multiAgentRunId, groupA.multi_agent_run_id));
    const runsB = await pg.handle.db
      .select()
      .from(t.agentRuns)
      .where(eq(t.agentRuns.multiAgentRunId, groupB.multi_agent_run_id));
    expect(runsA).toHaveLength(1);
    expect(runsB).toHaveLength(1);
    expect(runsA[0]!.id).not.toBe(runsB[0]!.id);
    expect(runsA[0]!.status).toBe('done');
    expect(runsB[0]!.status).toBe('done');

    await app.close();
  });

  it('AC-4: zero / unknown / disabled / other-workspace / duplicate agentIds are rejected (422 validation_error) with zero new rows in all 3 tables', async () => {
    const app = await appWith();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const disabledAgent = await createAgent(app, 'Disabled MA', { enabled: false });
    const validAgent = await createAgent(app, 'Valid MA for dup check');

    const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: 'other-ws' }).returning();
    const [otherAgent] = await pg.handle.db
      .insert(t.agents)
      .values({
        workspaceId: otherWs!.id,
        name: 'Other WS agent',
        provider: 'openai',
        model: 'gpt-4.1',
        systemPrompt: 's',
      })
      .returning();

    const countRows = async () => ({
      groups: (await pg.handle.db.select().from(t.multiAgentRuns).where(eq(t.multiAgentRuns.prId, pr.id))).length,
      runs: (await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.prId, pr.id))).length,
      reviews: (await pg.handle.db.select().from(t.reviews).where(eq(t.reviews.prId, pr.id))).length,
    });
    const before = await countRows();

    const invalidBodies = [
      { agentIds: [] },
      { agentIds: ['00000000-0000-0000-0000-000000000000'] },
      { agentIds: [disabledAgent.id] },
      { agentIds: [otherAgent!.id] },
      { agentIds: [validAgent.id, validAgent.id] },
    ];
    for (const payload of invalidBodies) {
      const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/multi-agent-run`, payload });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('validation_error');
    }

    const after = await countRows();
    expect(after).toEqual(before);

    await app.close();
  });
});
