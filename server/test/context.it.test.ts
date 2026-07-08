import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink } from 'node:fs/promises';
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
  console.warn('[context] Docker not available — skipping integration tests.');
}

const SECRET_OUTSIDE_CONTENT = 'SECRET_TOKEN_12345\n';

d('Project Context discovery + preview (GET /repos/:id/context, GET /repos/:id/context/file)', () => {
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

  async function makeRepo(clonePath: string | null): Promise<string> {
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: `ctxtest-${Math.random().toString(36).slice(2)}`,
        fullName: `acme/ctxtest-${Math.random().toString(36).slice(2)}`,
        defaultBranch: 'main',
        clonePath,
      })
      .returning();
    return repo!.id;
  }

  async function makeApp() {
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

  it('discovers .md docs under specs/docs/insights, badges them, excludes non-root and non-.md files', async () => {
    const clonePath = await mkdtemp(join(tmpdir(), 'dd-context-'));
    await writeFileAt(clonePath, 'specs/a.md', '# a');
    await writeFileAt(clonePath, 'docs/b.md', '# b');
    await writeFileAt(clonePath, 'deep/nested/insights/c.md', '# c');
    await writeFileAt(clonePath, 'src/x.md', '# x (not under a root)');
    await writeFileAt(clonePath, 'specs/notes.txt', 'not markdown');

    const repoId = await makeRepo(clonePath);
    const app = await makeApp();

    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/context` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.indexed).toBe(true);

    const byPath = new Map(body.documents.map((doc: { path: string; badge: string }) => [doc.path, doc.badge]));
    expect(byPath.get('specs/a.md')).toBe('specs');
    expect(byPath.get('docs/b.md')).toBe('docs');
    expect(byPath.get('deep/nested/insights/c.md')).toBe('insights');
    expect(byPath.has('src/x.md')).toBe(false);
    expect(byPath.has('specs/notes.txt')).toBe(false);
    expect(body.documents).toHaveLength(3);

    for (const doc of body.documents) {
      expect(typeof doc.token_count).toBe('number');
      expect(doc.token_count).toBeGreaterThan(0);
    }

    await app.close();
  });

  it('a repo with no clone path → { indexed: false, documents: [] }, never 500', async () => {
    const repoId = await makeRepo(null);
    const app = await makeApp();

    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/context` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ indexed: false, documents: [] });

    await app.close();
  });

  it('preview returns the doc content for a valid attached-set path', async () => {
    const clonePath = await mkdtemp(join(tmpdir(), 'dd-context-'));
    await writeFileAt(clonePath, 'specs/a.md', '# a\n\nSome rule text.');
    const repoId = await makeRepo(clonePath);
    const app = await makeApp();

    const res = await app.inject({
      method: 'GET',
      url: `/repos/${repoId}/context/file?path=specs/a.md`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().content).toContain('Some rule text.');

    await app.close();
  });

  it('preview 404s on a syntactic traversal attempt (path escapes the clone)', async () => {
    const clonePath = await mkdtemp(join(tmpdir(), 'dd-context-'));
    await writeFileAt(clonePath, 'specs/a.md', '# a');
    await writeFile(join(clonePath, '..', 'secret-outside.txt'), SECRET_OUTSIDE_CONTENT, 'utf8');
    const repoId = await makeRepo(clonePath);
    const app = await makeApp();

    const res = await app.inject({
      method: 'GET',
      url: `/repos/${repoId}/context/file?path=${encodeURIComponent('../secret-outside.txt')}`,
    });
    expect(res.statusCode).toBe(404);

    await app.close();
  });

  it('preview 404s on a symlink escaping the clone directory', async () => {
    const clonePath = await mkdtemp(join(tmpdir(), 'dd-context-'));
    await writeFileAt(clonePath, 'specs/a.md', '# a');
    const outsideDir = await mkdtemp(join(tmpdir(), 'dd-outside-'));
    const secretPath = join(outsideDir, 'secret.txt');
    await writeFile(secretPath, SECRET_OUTSIDE_CONTENT, 'utf8');
    await symlink(secretPath, join(clonePath, 'evil-link.md'));

    const repoId = await makeRepo(clonePath);
    const app = await makeApp();

    const res = await app.inject({
      method: 'GET',
      url: `/repos/${repoId}/context/file?path=evil-link.md`,
    });
    expect(res.statusCode).toBe(404);

    await app.close();
  });
});
