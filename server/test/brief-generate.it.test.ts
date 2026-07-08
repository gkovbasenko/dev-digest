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
  console.warn('[brief-generate] Docker not available — skipping integration tests.');
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

// AC-7: cites a real changed file AND a hallucinated path that is neither a
// pr_file nor recognized by the repo-intel index.
const GHOST_BRIEF = {
  ...VALID_BRIEF,
  risks: [
    { ...VALID_BRIEF.risks[0], file_refs: ['src/real.ts', 'src/ghost-does-not-exist.ts'] },
  ],
  review_focus: [
    { file: 'src/real.ts', note: 'real' },
    { file: 'src/ghost-does-not-exist.ts', note: 'ghost' },
  ],
};

const NON_FILE_INDEXED_BRIEF = {
  ...VALID_BRIEF,
  risks: [{ ...VALID_BRIEF.risks[0], file_refs: ['src/indexed-not-changed.ts'] }],
  review_focus: [],
};

// AC-3: `risk_level` outside the RiskSeverity enum — must fail schema validation.
const INVALID_BRIEF = { ...VALID_BRIEF, risk_level: 'critical' };

d('Brief generation (POST /pulls/:id/brief)', () => {
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

  async function setupRepoAndPr(
    opts: {
      files?: { path: string; patch?: string | null; additions?: number; deletions?: number }[];
      headSha?: string;
    } = {},
  ): Promise<{ repoId: string; prId: string }> {
    const suffix = Math.random().toString(36).slice(2);
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: `brief-${suffix}`,
        fullName: `acme/brief-${suffix}`,
        defaultBranch: 'main',
      })
      .returning();

    const files = opts.files ?? [
      { path: 'src/real.ts', additions: 5, deletions: 1, patch: '@@ -1,1 +1,2 @@\n+x' },
    ];

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
        headSha: opts.headSha ?? 'sha-a',
        additions: 1,
        deletions: 0,
        filesCount: files.length,
        status: 'needs_review',
        body: 'Adds a rate-limiting middleware.',
      })
      .returning();

    if (files.length > 0) {
      await pg.handle.db.insert(t.prFiles).values(
        files.map((f) => ({
          prId: pr!.id,
          path: f.path,
          additions: f.additions ?? 1,
          deletions: f.deletions ?? 0,
          patch: f.patch ?? null,
        })),
      );
    }

    return { repoId: repo!.id, prId: pr!.id };
  }

  async function makeApp(structured: unknown, repoIntelOpts: MockRepoIntelOptions = {}) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const llm = new MockLLMProvider('openai', { structured });
    const github = new MockGitHubClient();
    const app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github,
        // FEATURE_MODELS' risk_brief default provider is 'openai'.
        llm: { openai: llm },
        repoIntel: new MockRepoIntel(repoIntelOpts),
      },
    });
    return { app, llm, github };
  }

  it('AC-1: makes exactly one completeStructured call and persists the row', async () => {
    const { prId } = await setupRepoAndPr();
    const { app, llm } = await makeApp(VALID_BRIEF, { indexedPaths: ['src/real.ts'] });

    const res = await app.inject({ method: 'POST', url: `/pulls/${prId}/brief` });
    expect(res.statusCode).toBe(200);

    const structuredCalls = llm.calls.filter((c) => c.method === 'completeStructured');
    expect(structuredCalls).toHaveLength(1);

    const body = res.json();
    expect(body.exists).toBe(true);
    expect(body.stale).toBe(false);
    expect(body.brief.what).toBe(VALID_BRIEF.what);
    expect(body.brief.risks[0].file_refs).toEqual(['src/real.ts']);

    const getRes = await app.inject({ method: 'GET', url: `/pulls/${prId}/brief` });
    expect(getRes.json().exists).toBe(true);
    expect(getRes.json().brief.what).toBe(VALID_BRIEF.what);

    await app.close();
  });

  it('AC-2: 422 with zero LLM calls and no write when the PR has no changed files', async () => {
    const { prId } = await setupRepoAndPr({ files: [] });
    const { app, llm } = await makeApp(VALID_BRIEF);

    const res = await app.inject({ method: 'POST', url: `/pulls/${prId}/brief` });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
    expect(llm.calls).toHaveLength(0);

    const rows = await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId));
    expect(rows).toHaveLength(0);

    await app.close();
  });

  it('AC-5: regenerating twice overwrites the single row (generated_at advances, still one row)', async () => {
    const { prId } = await setupRepoAndPr();
    const { app: app1 } = await makeApp(VALID_BRIEF, { indexedPaths: ['src/real.ts'] });
    const first = await app1.inject({ method: 'POST', url: `/pulls/${prId}/brief` });
    expect(first.statusCode).toBe(200);
    await app1.close();

    await new Promise((r) => setTimeout(r, 10));

    const { app: app2 } = await makeApp(VALID_BRIEF, { indexedPaths: ['src/real.ts'] });
    const second = await app2.inject({ method: 'POST', url: `/pulls/${prId}/brief` });
    await app2.close();

    expect(new Date(second.json().generated_at).getTime()).toBeGreaterThan(
      new Date(first.json().generated_at).getTime(),
    );

    const rows = await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId));
    expect(rows).toHaveLength(1);
  });

  it('AC-7: drops a hallucinated file ref not in pr_files or the repo index, keeps a real one', async () => {
    const { prId } = await setupRepoAndPr();
    const { app } = await makeApp(GHOST_BRIEF, { indexedPaths: ['src/real.ts'] });

    const res = await app.inject({ method: 'POST', url: `/pulls/${prId}/brief` });
    expect(res.statusCode).toBe(200);
    const brief = res.json().brief;
    expect(brief.risks[0].file_refs).toEqual(['src/real.ts']);
    expect(brief.review_focus).toEqual([{ file: 'src/real.ts', note: 'real' }]);

    await app.close();
  });

  it('AC-7: keeps a file ref recognized by the repo-intel index even when it is not itself a changed pr_file', async () => {
    const { prId } = await setupRepoAndPr();
    const { app } = await makeApp(NON_FILE_INDEXED_BRIEF, { indexedPaths: ['src/indexed-not-changed.ts'] });

    const res = await app.inject({ method: 'POST', url: `/pulls/${prId}/brief` });
    expect(res.statusCode).toBe(200);
    expect(res.json().brief.risks[0].file_refs).toEqual(['src/indexed-not-changed.ts']);

    await app.close();
  });

  it('AC-3/AC-18: an out-of-enum risk_level fails validation, is not persisted, and leaves a prior row byte-identical', async () => {
    const { prId } = await setupRepoAndPr();

    // First, a successful generation to have something to preserve.
    const { app: goodApp } = await makeApp(VALID_BRIEF, { indexedPaths: ['src/real.ts'] });
    const good = await goodApp.inject({ method: 'POST', url: `/pulls/${prId}/brief` });
    expect(good.statusCode).toBe(200);
    await goodApp.close();

    const before = await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId));
    expect(before).toHaveLength(1);

    // Then, an invalid generation (`risk_level` outside the enum).
    const { app: badApp, llm: badLlm, github } = await makeApp(INVALID_BRIEF, {
      indexedPaths: ['src/real.ts'],
    });
    const bad = await badApp.inject({ method: 'POST', url: `/pulls/${prId}/brief` });
    expect(bad.statusCode).toBe(500); // schema validation failure surfaces as a clean uncaught error, not a hang
    expect(badLlm.calls.filter((c) => c.method === 'completeStructured').length).toBeGreaterThan(0);
    // No write-side adapter call happens on a failed generation.
    expect(github.posted).toHaveLength(0);
    expect(github.openedPrs).toHaveLength(0);
    expect(github.committed).toHaveLength(0);
    await badApp.close();

    const after = await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId));
    expect(after).toHaveLength(1);
    expect(after[0]).toEqual(before[0]); // byte-identical, untouched by the failed attempt
  });
});
