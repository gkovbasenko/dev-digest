import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  console.warn('[skills-context] Docker not available — skipping integration tests.');
}

/**
 * Skill-side Project Context attachment (T5, AC-5): same persistence + caps
 * contract as the agent side, mirrored onto `skill_context_docs`.
 */
d('GET/POST /skills/:id/context', () => {
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

  async function writeFileAt(root: string, rel: string, contents: string): Promise<void> {
    const full = join(root, rel);
    await mkdir(full.slice(0, full.lastIndexOf('/')), { recursive: true });
    await writeFile(full, contents, 'utf8');
  }

  async function makeRepo(clonePath: string): Promise<string> {
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: `sctx-${Math.random().toString(36).slice(2)}`,
        fullName: `acme/sctx-${Math.random().toString(36).slice(2)}`,
        defaultBranch: 'main',
        clonePath,
      })
      .returning();
    return repo!.id;
  }

  async function makeSkill(app: Awaited<ReturnType<typeof makeApp>>): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: `Skill ${Math.random().toString(36).slice(2)}`, body: 'Some rule.' },
    });
    return res.json().id as string;
  }

  it('POST persists the exact ordered path list; GET returns it back', async () => {
    const app = await makeApp();
    const clonePath = await mkdtemp(join(tmpdir(), 'dd-skill-ctx-'));
    await writeFileAt(clonePath, 'specs/public-api.md', 'The public API contract.');
    const repoId = await makeRepo(clonePath);
    const skillId = await makeSkill(app);

    const post = await app.inject({
      method: 'POST',
      url: `/skills/${skillId}/context?repo_id=${repoId}`,
      payload: { paths: ['specs/public-api.md'] },
    });
    expect(post.statusCode).toBe(200);
    expect(post.json()).toEqual([{ path: 'specs/public-api.md', order: 0 }]);

    const get = await app.inject({ method: 'GET', url: `/skills/${skillId}/context` });
    expect(get.json()).toEqual([{ path: 'specs/public-api.md', order: 0 }]);

    await app.close();
  });

  it('rejects a path that fails realpath containment — persists nothing', async () => {
    const app = await makeApp();
    const clonePath = await mkdtemp(join(tmpdir(), 'dd-skill-ctx-'));
    await writeFileAt(clonePath, 'specs/a.md', 'fine');
    const repoId = await makeRepo(clonePath);
    const skillId = await makeSkill(app);

    const post = await app.inject({
      method: 'POST',
      url: `/skills/${skillId}/context?repo_id=${repoId}`,
      payload: { paths: ['../../../../etc/passwd'] },
    });
    expect(post.statusCode).toBe(422);

    const get = await app.inject({ method: 'GET', url: `/skills/${skillId}/context` });
    expect(get.json()).toEqual([]);

    await app.close();
  });
});
