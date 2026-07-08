import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { MockRepoIntel } from './helpers/repo-intel.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[onboarding-read] Docker not available — skipping integration tests.');
}

const SAMPLE_SECTIONS = [
  { kind: 'architecture', title: 'Architecture', body: 'body', diagram: 'flowchart TD\nA-->B', links: [] },
  { kind: 'critical_paths', title: 'Critical paths', body: 'body', diagram: null, links: [] },
  { kind: 'how_to_run', title: 'How to run', body: 'body', diagram: null, links: [] },
  { kind: 'guided_reading', title: 'Guided reading', body: 'body', diagram: null, links: [] },
  { kind: 'first_tasks', title: 'First tasks', body: 'body', diagram: null, links: [] },
];

d('Onboarding read (GET /repos/:id/onboarding)', () => {
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

  async function makeRepo(): Promise<string> {
    const suffix = Math.random().toString(36).slice(2);
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: `onboardread-${suffix}`,
        fullName: `acme/onboardread-${suffix}`,
        defaultBranch: 'main',
      })
      .returning();
    return repo!.id;
  }

  function makeApp(repoIntel: MockRepoIntel, llm = new MockLLMProvider('openai')) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        llm: { openai: llm },
        repoIntel,
      },
    });
  }

  it('AC-9: before generation, returns 200 with exists:false and empty sections rather than 404', async () => {
    const repoId = await makeRepo();
    const app = await makeApp(new MockRepoIntel({ indexState: { filesIndexed: 5 } }));

    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/onboarding` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.exists).toBe(false);
    expect(body.indexed).toBe(true);
    expect(body.stale).toBe(false);
    expect(body.sections).toEqual([]);
    expect(body.generated_at).toBeNull();
    expect(body.source_file_count).toBe(0);

    await app.close();
  });

  it('AC-9: indexed=false when the repo has never been indexed (filesIndexed=0)', async () => {
    const repoId = await makeRepo();
    const app = await makeApp(new MockRepoIntel({ indexState: { filesIndexed: 0 } }));

    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/onboarding` });
    expect(res.statusCode).toBe(200);
    expect(res.json().indexed).toBe(false);

    await app.close();
  });

  it('AC-9/AC-10: after generation, returns the persisted sections + generated_at + source_file_count = filesIndexed at generation time, stale:false when SHAs match', async () => {
    const repoId = await makeRepo();
    const generatedAt = new Date('2026-01-01T00:00:00Z');

    await pg.handle.db.insert(t.onboarding).values({
      repoId,
      json: { sections: SAMPLE_SECTIONS },
      generatedAt,
      generationSha: 'sha-a',
      sourceFileCount: 7,
    });

    const app = await makeApp(
      new MockRepoIntel({ indexState: { filesIndexed: 7, lastIndexedSha: 'sha-a' } }),
    );
    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/onboarding` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.exists).toBe(true);
    expect(body.indexed).toBe(true);
    expect(body.stale).toBe(false);
    expect(body.sections).toHaveLength(5);
    expect(body.sections.map((s: { kind: string }) => s.kind)).toEqual([
      'architecture',
      'critical_paths',
      'how_to_run',
      'guided_reading',
      'first_tasks',
    ]);
    expect(body.generated_at).toBe(generatedAt.toISOString());
    expect(body.source_file_count).toBe(7);

    await app.close();
  });

  it('AC-10: stale becomes true once the repo has been re-indexed since generation (SHA advanced)', async () => {
    const repoId = await makeRepo();
    await pg.handle.db.insert(t.onboarding).values({
      repoId,
      json: { sections: SAMPLE_SECTIONS },
      generatedAt: new Date('2026-01-01T00:00:00Z'),
      generationSha: 'sha-a',
      sourceFileCount: 7,
    });

    const app = await makeApp(
      new MockRepoIntel({ indexState: { filesIndexed: 9, lastIndexedSha: 'sha-b' } }),
    );
    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/onboarding` });
    expect(res.json().stale).toBe(true);
    // cached content is still returned even though stale
    expect(res.json().sections).toHaveLength(5);

    await app.close();
  });

  it('AC-10: a pre-migration row with a null generationSha reads as stale (never equal to a real SHA)', async () => {
    const repoId = await makeRepo();
    await pg.handle.db.insert(t.onboarding).values({
      repoId,
      json: { sections: SAMPLE_SECTIONS },
      generatedAt: new Date('2026-01-01T00:00:00Z'),
      generationSha: null,
      sourceFileCount: null,
    });

    const app = await makeApp(new MockRepoIntel({ indexState: { lastIndexedSha: 'sha-a' } }));
    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/onboarding` });
    expect(res.json().stale).toBe(true);
    expect(res.json().source_file_count).toBe(0);

    await app.close();
  });

  it('AC-23: reading the onboarding doc makes zero LLM calls', async () => {
    const repoId = await makeRepo();
    await pg.handle.db.insert(t.onboarding).values({
      repoId,
      json: { sections: SAMPLE_SECTIONS },
      generatedAt: new Date(),
      generationSha: 'sha-a',
      sourceFileCount: 3,
    });

    const llm = new MockLLMProvider('openai');
    const app = await makeApp(new MockRepoIntel({ indexState: { lastIndexedSha: 'sha-a' } }), llm);
    await app.inject({ method: 'GET', url: `/repos/${repoId}/onboarding` });
    expect(llm.calls).toHaveLength(0);

    await app.close();
  });

  it('a corrupt/malformed row.json degrades to empty sections instead of a 500', async () => {
    const repoId = await makeRepo();
    await pg.handle.db.insert(t.onboarding).values({
      repoId,
      json: { not: 'a valid onboarding doc shape' },
      generatedAt: new Date(),
      generationSha: 'sha-a',
      sourceFileCount: 3,
    });

    const app = await makeApp(new MockRepoIntel());
    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/onboarding` });
    expect(res.statusCode).toBe(200);
    expect(res.json().exists).toBe(true);
    expect(res.json().sections).toEqual([]);

    await app.close();
  });
});
