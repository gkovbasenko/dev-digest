import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  console.warn('[onboarding-generate] Docker not available — skipping integration tests.');
}

const REAL_LINK = { label: 'Real file', path: 'src/real.ts' };
const GHOST_LINK = { label: 'Hallucinated', path: 'src/ghost-does-not-exist.ts' };

// Deliberately out of ONBOARDING_SECTION_KINDS order, with a diagram on a
// non-architecture section and a mix of a real + a hallucinated link — exercises
// AC-3 (reorder), AC-7 (ghost path dropped), AC-8 (diagram stripped) at once.
const VALID_RAW_SECTIONS = [
  { kind: 'first_tasks', title: 'First tasks', body: 'Do the first task.', diagram: null, links: [REAL_LINK] },
  {
    kind: 'architecture',
    title: 'Architecture',
    body: 'How it fits together.',
    diagram: 'flowchart TD\nA-->B',
    links: [REAL_LINK, GHOST_LINK],
  },
  {
    kind: 'how_to_run',
    title: 'How to run',
    body: 'Run it like this.',
    diagram: 'flowchart TD\nX-->Y', // must be stripped — not the architecture section
    links: [],
  },
  { kind: 'critical_paths', title: 'Critical paths', body: 'Follow this chain.', diagram: null, links: [GHOST_LINK] },
  { kind: 'guided_reading', title: 'Guided reading', body: 'Read these files.', diagram: null, links: [] },
];

// AC-3: missing the `guided_reading` kind — must fail schema validation.
const INVALID_RAW_SECTIONS = VALID_RAW_SECTIONS.filter((s) => s.kind !== 'guided_reading');

d('Onboarding generation (POST /repos/:id/onboarding/regenerate)', () => {
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

  async function makeClonedRepo(): Promise<{ repoId: string; clonePath: string }> {
    const clonePath = await mkdtemp(join(tmpdir(), 'dd-onboarding-'));
    await writeFile(join(clonePath, 'README.md'), '# Acme repo\nA sample repo.', 'utf8');
    await writeFile(join(clonePath, 'package.json'), '{"name":"acme"}', 'utf8');

    const suffix = Math.random().toString(36).slice(2);
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: `onboardgen-${suffix}`,
        fullName: `acme/onboardgen-${suffix}`,
        defaultBranch: 'main',
        clonePath,
      })
      .returning();
    return { repoId: repo!.id, clonePath };
  }

  async function makeUnclonedRepo(): Promise<string> {
    const suffix = Math.random().toString(36).slice(2);
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: `onboardnoclone-${suffix}`,
        fullName: `acme/onboardnoclone-${suffix}`,
        defaultBranch: 'main',
      })
      .returning();
    return repo!.id;
  }

  async function makeApp(
    sections: unknown[] | 'invalid-not-array',
    repoIntelOpts: MockRepoIntelOptions = { topFiles: ['src/real.ts', 'src/other.ts'] },
  ) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const llm = new MockLLMProvider('openai', {
      structured: sections === 'invalid-not-array' ? { sections: 'not-an-array' } : { sections },
    });
    const app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        // FEATURE_MODELS' onboarding default provider is 'openrouter'.
        llm: { openrouter: llm },
        repoIntel: new MockRepoIntel(repoIntelOpts),
      },
    });
    return { app, llm };
  }

  it('AC-1: assembles the prompt from the index, makes exactly one completeStructured call, and persists the doc', async () => {
    const { repoId } = await makeClonedRepo();
    const { app, llm } = await makeApp(VALID_RAW_SECTIONS);

    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/regenerate` });
    expect(res.statusCode).toBe(200);

    const structuredCalls = llm.calls.filter((c) => c.method === 'completeStructured');
    expect(structuredCalls).toHaveLength(1);

    const body = res.json();
    expect(body.exists).toBe(true);
    expect(body.sections).toHaveLength(5);

    const getRes = await app.inject({ method: 'GET', url: `/repos/${repoId}/onboarding` });
    expect(getRes.json().exists).toBe(true);
    expect(getRes.json().sections).toHaveLength(5);

    await app.close();
  });

  it('AC-3: reorders sections to the fixed ONBOARDING_SECTION_KINDS order regardless of model output order', async () => {
    const { repoId } = await makeClonedRepo();
    const { app } = await makeApp(VALID_RAW_SECTIONS);

    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/regenerate` });
    expect(res.json().sections.map((s: { kind: string }) => s.kind)).toEqual([
      'architecture',
      'critical_paths',
      'how_to_run',
      'guided_reading',
      'first_tasks',
    ]);

    await app.close();
  });

  it('AC-7: drops a hallucinated link.path not present in the repo index, keeps a real one', async () => {
    const { repoId } = await makeClonedRepo();
    const { app } = await makeApp(VALID_RAW_SECTIONS);

    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/regenerate` });
    const sections = res.json().sections as { kind: string; links: { path: string }[] }[];

    const architecture = sections.find((s) => s.kind === 'architecture')!;
    expect(architecture.links.map((l) => l.path)).toEqual(['src/real.ts']);

    const criticalPaths = sections.find((s) => s.kind === 'critical_paths')!;
    expect(criticalPaths.links).toEqual([]); // its only link was the ghost path

    const firstTasks = sections.find((s) => s.kind === 'first_tasks')!;
    expect(firstTasks.links.map((l) => l.path)).toEqual(['src/real.ts']);

    await app.close();
  });

  it('AC-8: strips diagram to null on every section except architecture', async () => {
    const { repoId } = await makeClonedRepo();
    const { app } = await makeApp(VALID_RAW_SECTIONS);

    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/regenerate` });
    const sections = res.json().sections as { kind: string; diagram: string | null }[];

    expect(sections.find((s) => s.kind === 'architecture')!.diagram).toBe('flowchart TD\nA-->B');
    for (const s of sections) {
      if (s.kind === 'architecture') continue;
      expect(s.diagram).toBeNull();
    }

    await app.close();
  });

  it('AC-6: every repo-derived segment sent to the model is wrapped in <untrusted> blocks', async () => {
    const { repoId } = await makeClonedRepo();
    const { app, llm } = await makeApp(VALID_RAW_SECTIONS);

    await app.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/regenerate` });
    const call = llm.calls.find((c) => c.method === 'completeStructured')!;
    const req = call.req as { messages: { role: string; content: string }[] };
    const system = req.messages[0]!.content;
    const user = req.messages[1]!.content;

    expect(user).toContain('<untrusted source="ranked-files">');
    expect(user).toContain('<untrusted source="critical-paths">');
    expect(user).toContain('<untrusted source="README.md">');
    expect(system).toContain('SECURITY');

    await app.close();
  });

  it('AC-5: regenerating twice overwrites the single row (generatedAt advances, still one row)', async () => {
    const { repoId } = await makeClonedRepo();
    const { app: app1 } = await makeApp(VALID_RAW_SECTIONS);
    const first = await app1.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/regenerate` });
    await app1.close();

    await new Promise((r) => setTimeout(r, 10));

    const { app: app2 } = await makeApp(VALID_RAW_SECTIONS);
    const second = await app2.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/regenerate` });
    await app2.close();

    expect(new Date(second.json().generated_at).getTime()).toBeGreaterThan(
      new Date(first.json().generated_at).getTime(),
    );

    const rows = await pg.handle.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repoId));
    expect(rows).toHaveLength(1);
  });

  it('AC-2: 422 with zero LLM calls and no write when the repo has no clone', async () => {
    const repoId = await makeUnclonedRepo();
    const { app, llm } = await makeApp(VALID_RAW_SECTIONS);

    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/regenerate` });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
    expect(llm.calls).toHaveLength(0);

    const rows = await pg.handle.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repoId));
    expect(rows).toHaveLength(0);

    await app.close();
  });

  it('AC-2: 422 with zero LLM calls and no write when the repo is cloned but has no ranked/indexed files', async () => {
    const { repoId } = await makeClonedRepo();
    const { app, llm } = await makeApp(VALID_RAW_SECTIONS, { topFiles: [] });

    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/regenerate` });
    expect(res.statusCode).toBe(422);
    expect(llm.calls).toHaveLength(0);

    const rows = await pg.handle.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repoId));
    expect(rows).toHaveLength(0);

    await app.close();
  });

  it('AC-3/AC-24: a payload missing a required section kind fails validation, is not persisted, and leaves a prior row byte-identical', async () => {
    const { repoId } = await makeClonedRepo();

    // First, a successful generation to have something to preserve.
    const { app: goodApp } = await makeApp(VALID_RAW_SECTIONS);
    const good = await goodApp.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/regenerate` });
    expect(good.statusCode).toBe(200);
    await goodApp.close();

    const before = await pg.handle.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repoId));
    expect(before).toHaveLength(1);

    // Then, an invalid (4-section) generation.
    const { app: badApp, llm: badLlm } = await makeApp(INVALID_RAW_SECTIONS);
    const bad = await badApp.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/regenerate` });
    expect(bad.statusCode).toBe(500); // schema validation failure surfaces as a clean uncaught error, not a hang
    // completeStructured was attempted (and retried internally by the mock's
    // single-shot throw) but the invalid result was never persisted.
    expect(badLlm.calls.filter((c) => c.method === 'completeStructured').length).toBeGreaterThan(0);
    await badApp.close();

    const after = await pg.handle.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repoId));
    expect(after).toHaveLength(1);
    expect(after[0]).toEqual(before[0]); // byte-identical, untouched by the failed attempt
  });

  it('AC-24: never sends a symlinked key file\'s off-clone content to the LLM (unconditional read, no LLM cooperation needed)', async () => {
    const { repoId, clonePath } = await makeClonedRepo();
    const outsideDir = await mkdtemp(join(tmpdir(), 'dd-onboarding-outside-'));
    const secretPath = join(outsideDir, 'secret.txt');
    await writeFile(secretPath, 'SECRET_TOKEN_ONBOARDING_98765', 'utf8');
    // README.md is one of KEY_FILE_CANDIDATES, read unconditionally — replace
    // the real one `makeClonedRepo` wrote with a symlink escaping the clone.
    await rm(join(clonePath, 'README.md'));
    await symlink(secretPath, join(clonePath, 'README.md'));

    const { app, llm } = await makeApp(VALID_RAW_SECTIONS);
    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/regenerate` });
    expect(res.statusCode).toBe(200);

    const call = llm.calls.find((c) => c.method === 'completeStructured')!;
    expect(JSON.stringify(call.req)).not.toContain('SECRET_TOKEN_ONBOARDING_98765');

    await app.close();
  });

  it('POST /repos/:id/onboarding/regenerate → LLM failure surfaces as a clean error, not a hang or crash', async () => {
    const { repoId } = await makeClonedRepo();
    const { app } = await makeApp('invalid-not-array');

    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/onboarding/regenerate` });
    expect(res.statusCode).toBe(500);

    await app.close();
  });
});
