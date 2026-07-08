import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { MockRepoIntel, type MockRepoIntelOptions } from './helpers/repo-intel.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[brief-read] Docker not available — skipping integration tests.');
}

const VALID_BRIEF = {
  what: 'Adds rate limiting to public endpoints.',
  why: 'Prevents abuse of unauthenticated routes.',
  risk_level: 'medium',
  risks: [
    {
      kind: 'correctness',
      title: 'Limiter bypass',
      explanation: 'The limiter may not cover every route.',
      severity: 'medium',
      file_refs: ['src/real.ts'],
    },
  ],
  review_focus: [{ file: 'src/real.ts', note: 'Check the limiter config.' }],
};

d('Brief read (GET /pulls/:id/brief)', () => {
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

  async function setupRepoAndPr(headSha = 'sha-a'): Promise<{ prId: string }> {
    const suffix = Math.random().toString(36).slice(2);
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: `briefread-${suffix}`,
        fullName: `acme/briefread-${suffix}`,
        defaultBranch: 'main',
      })
      .returning();

    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 900 + Math.floor(Math.random() * 10000),
        title: 'Add rate limiting to public endpoints',
        author: 'marisa.koch',
        branch: 'feat/rl',
        base: 'main',
        headSha,
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
        body: 'Adds a rate-limiting middleware.',
      })
      .returning();

    await pg.handle.db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/real.ts',
      additions: 5,
      deletions: 1,
      patch: '@@ -1,1 +1,2 @@\n+x',
    });

    return { prId: pr!.id };
  }

  async function makeApp(structured: unknown, repoIntelOpts: MockRepoIntelOptions = {}) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const llm = new MockLLMProvider('openai', { structured });
    const app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        llm: { openai: llm },
        repoIntel: new MockRepoIntel(repoIntelOpts),
      },
    });
    return { app, llm };
  }

  it('AC-9: before generation, returns exists:false / stale:false / generated_at:null / brief:null (200, not 404)', async () => {
    const { prId } = await setupRepoAndPr();
    const { app } = await makeApp(VALID_BRIEF);

    const res = await app.inject({ method: 'GET', url: `/pulls/${prId}/brief` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ exists: false, stale: false, generated_at: null, brief: null });

    await app.close();
  });

  it('AC-9: after generation, GET returns the persisted brief with a generated_at timestamp', async () => {
    const { prId } = await setupRepoAndPr();
    const { app } = await makeApp(VALID_BRIEF, { indexedPaths: ['src/real.ts'] });

    const post = await app.inject({ method: 'POST', url: `/pulls/${prId}/brief` });
    expect(post.statusCode).toBe(200);

    const res = await app.inject({ method: 'GET', url: `/pulls/${prId}/brief` });
    const body = res.json();
    expect(body.exists).toBe(true);
    expect(body.stale).toBe(false);
    expect(body.generated_at).not.toBeNull();
    expect(body.brief.what).toBe(VALID_BRIEF.what);

    await app.close();
  });

  it('AC-10: stale becomes true once the PR head SHA advances past the generation SHA', async () => {
    const { prId } = await setupRepoAndPr('sha-a');
    const { app } = await makeApp(VALID_BRIEF, { indexedPaths: ['src/real.ts'] });

    const gen = await app.inject({ method: 'POST', url: `/pulls/${prId}/brief` });
    expect(gen.json().stale).toBe(false);

    await pg.handle.db.update(t.pullRequests).set({ headSha: 'sha-b' }).where(eq(t.pullRequests.id, prId));

    const res = await app.inject({ method: 'GET', url: `/pulls/${prId}/brief` });
    expect(res.json().stale).toBe(true);
    // cached content is still returned even though stale
    expect(res.json().brief.what).toBe(VALID_BRIEF.what);

    await app.close();
  });

  it('AC-10: a pre-migration row with a null generationHeadSha reads as stale (never equal to a real SHA)', async () => {
    const { prId } = await setupRepoAndPr('sha-a');
    await pg.handle.db.insert(t.prBrief).values({
      prId,
      json: VALID_BRIEF,
      generatedAt: new Date('2026-01-01T00:00:00Z'),
      generationHeadSha: null,
    });

    const { app } = await makeApp(VALID_BRIEF);
    const res = await app.inject({ method: 'GET', url: `/pulls/${prId}/brief` });
    expect(res.json().stale).toBe(true);
    expect(res.json().exists).toBe(true);

    await app.close();
  });

  it('AC-17: GET makes zero LLM calls; only POST increments the call count', async () => {
    const { prId } = await setupRepoAndPr();
    const { app, llm } = await makeApp(VALID_BRIEF, { indexedPaths: ['src/real.ts'] });

    await app.inject({ method: 'GET', url: `/pulls/${prId}/brief` });
    expect(llm.calls).toHaveLength(0);

    await app.inject({ method: 'POST', url: `/pulls/${prId}/brief` });
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);

    await app.inject({ method: 'GET', url: `/pulls/${prId}/brief` });
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);

    await app.close();
  });
});
