import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[agents-stats] Docker not available — skipping integration tests.');
}

/**
 * T5 — GET /agents/:id/stats (minimal AgentStats subset): `agent_id`,
 * `agent_name`, `runs`, `avg_cost_usd`, `avg_latency_ms`. Cost is derived via
 * `estimateCost(model, tokensIn, tokensOut)` over 'done' runs only (agent_runs
 * has no cost_usd column — server INSIGHTS 2026-06-29); averages are null when
 * there are zero runs or zero 'done' runs. Workspace-scoped: a foreign agent
 * id 404s rather than leaking another workspace's stats (A01).
 */
d('GET /agents/:id/stats', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    const s = await seed(pg.handle.db);
    workspaceId = s.workspaceId;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  const createBody = {
    name: 'Stats Agent',
    provider: 'openai' as const,
    model: 'gpt-4o-mini',
    system_prompt: 'Review the diff.',
  };

  it('two done runs produce correct avg_cost_usd and avg_latency_ms', async () => {
    const app = await makeApp();
    const created = await app.inject({ method: 'POST', url: '/agents', payload: createBody });
    expect(created.statusCode).toBe(201);
    const agentId = created.json().id as string;

    // gpt-4o-mini pricing: in $0.15 / 1M, out $0.60 / 1M (adapters/llm/pricing.ts).
    // run1: (1000*0.15 + 500*0.6)/1e6  = 0.00045
    // run2: (2000*0.15 + 1000*0.6)/1e6 = 0.0009
    // avg cost  = 0.000675, avg latency = (1000+3000)/2 = 2000
    await pg.handle.db.insert(t.agentRuns).values([
      {
        workspaceId,
        agentId,
        status: 'done',
        model: 'gpt-4o-mini',
        tokensIn: 1000,
        tokensOut: 500,
        durationMs: 1000,
      },
      {
        workspaceId,
        agentId,
        status: 'done',
        model: 'gpt-4o-mini',
        tokensIn: 2000,
        tokensOut: 1000,
        durationMs: 3000,
      },
    ]);

    const res = await app.inject({ method: 'GET', url: `/agents/${agentId}/stats` });
    expect(res.statusCode).toBe(200);
    const stats = res.json();
    expect(stats).toMatchObject({ agent_id: agentId, agent_name: 'Stats Agent', runs: 2 });
    expect(stats.avg_cost_usd).toBeCloseTo(0.000675, 9);
    expect(stats.avg_latency_ms).toBe(2000);
    await app.close();
  });

  it('a run with an unpriced model is excluded from avg_cost_usd but still counts toward runs/latency', async () => {
    const app = await makeApp();
    const agentId = (
      await app.inject({ method: 'POST', url: '/agents', payload: createBody })
    ).json().id as string;

    await pg.handle.db.insert(t.agentRuns).values([
      {
        workspaceId,
        agentId,
        status: 'done',
        model: 'gpt-4o-mini',
        tokensIn: 1000,
        tokensOut: 500,
        durationMs: 1000,
      },
      {
        workspaceId,
        agentId,
        status: 'done',
        model: 'some-unknown-model-slug',
        tokensIn: 1000,
        tokensOut: 500,
        durationMs: 3000,
      },
    ]);

    const res = await app.inject({ method: 'GET', url: `/agents/${agentId}/stats` });
    expect(res.statusCode).toBe(200);
    const stats = res.json();
    expect(stats.runs).toBe(2);
    expect(stats.avg_cost_usd).toBeCloseTo(0.00045, 9); // only the priced run
    expect(stats.avg_latency_ms).toBe(2000); // both done runs have a duration
    await app.close();
  });

  it('a zero-run agent has null averages', async () => {
    const app = await makeApp();
    const agentId = (
      await app.inject({ method: 'POST', url: '/agents', payload: createBody })
    ).json().id as string;

    const res = await app.inject({ method: 'GET', url: `/agents/${agentId}/stats` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      agent_id: agentId,
      runs: 0,
      avg_cost_usd: null,
      avg_latency_ms: null,
    });
    await app.close();
  });

  it('an agent with only failed runs has runs > 0 but null averages', async () => {
    const app = await makeApp();
    const agentId = (
      await app.inject({ method: 'POST', url: '/agents', payload: createBody })
    ).json().id as string;

    await pg.handle.db.insert(t.agentRuns).values([
      { workspaceId, agentId, status: 'failed', error: 'boom' },
      { workspaceId, agentId, status: 'cancelled' },
    ]);

    const res = await app.inject({ method: 'GET', url: `/agents/${agentId}/stats` });
    expect(res.statusCode).toBe(200);
    const stats = res.json();
    expect(stats.runs).toBe(2);
    expect(stats.avg_cost_usd).toBeNull();
    expect(stats.avg_latency_ms).toBeNull();
    await app.close();
  });

  it('404s for an agent id that never existed', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'GET',
      url: '/agents/00000000-0000-0000-0000-000000000000/stats',
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('is workspace-scoped: another tenant cannot read another workspace\'s agent stats', async () => {
    const { db } = pg.handle;
    const [otherWs] = await db.insert(t.workspaces).values({ name: 'stats-other' }).returning();
    const [foreignAgent] = await db
      .insert(t.agents)
      .values({
        workspaceId: otherWs!.id,
        name: 'Foreign Stats Agent',
        provider: 'openai',
        model: 'gpt-4o-mini',
        systemPrompt: 'x',
      })
      .returning();
    await db.insert(t.agentRuns).values({
      workspaceId: otherWs!.id,
      agentId: foreignAgent!.id,
      status: 'done',
      model: 'gpt-4o-mini',
      tokensIn: 1000,
      tokensOut: 500,
      durationMs: 1000,
    });

    const app = await makeApp();
    // The request context resolves to the seeded default workspace, not otherWs.
    const res = await app.inject({ method: 'GET', url: `/agents/${foreignAgent!.id}/stats` });
    expect(res.statusCode).toBe(404);
    await app.close();

    // Sanity: the agent really exists (its own workspace can see it) — the 404
    // above is workspace scoping, not "id doesn't exist".
    const [stillThere] = await db
      .select()
      .from(t.agents)
      .where(eq(t.agents.id, foreignAgent!.id));
    expect(stillThere).toBeDefined();
  });
});
