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
import { PER_DOC_TOKEN_CAP, AGGREGATE_TOKEN_CAP } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[agents-context] Docker not available — skipping integration tests.');
}

/**
 * Agent-side Project Context attachment (T5, AC-4/AC-13/AC-14): persist an
 * ordered path list (paths only, no text), rejecting over-cap or containment-
 * failing submissions with nothing persisted.
 */
d('GET/POST /agents/:id/context', () => {
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
        name: `actx-${Math.random().toString(36).slice(2)}`,
        fullName: `acme/actx-${Math.random().toString(36).slice(2)}`,
        defaultBranch: 'main',
        clonePath,
      })
      .returning();
    return repo!.id;
  }

  async function makeAgent(app: Awaited<ReturnType<typeof makeApp>>): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: `Agent ${Math.random().toString(36).slice(2)}`,
        provider: 'openai',
        model: 'gpt-4o-mini',
        system_prompt: 'Review the diff.',
      },
    });
    return res.json().id as string;
  }

  it('POST persists the exact ordered path list; GET returns it back', async () => {
    const app = await makeApp();
    const clonePath = await mkdtemp(join(tmpdir(), 'dd-agent-ctx-'));
    await writeFileAt(clonePath, 'specs/a.md', 'A'.repeat(100));
    await writeFileAt(clonePath, 'docs/b.md', 'B'.repeat(100));
    const repoId = await makeRepo(clonePath);
    const agentId = await makeAgent(app);

    const post = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/context?repo_id=${repoId}`,
      payload: { paths: ['specs/a.md', 'docs/b.md'] },
    });
    expect(post.statusCode).toBe(200);
    expect(post.json()).toEqual([
      { path: 'specs/a.md', order: 0 },
      { path: 'docs/b.md', order: 1 },
    ]);

    const get = await app.inject({ method: 'GET', url: `/agents/${agentId}/context` });
    expect(get.json()).toEqual([
      { path: 'specs/a.md', order: 0 },
      { path: 'docs/b.md', order: 1 },
    ]);

    await app.close();
  });

  it('rejects a submission with a doc over PER_DOC_TOKEN_CAP — persists nothing', async () => {
    const app = await makeApp();
    const clonePath = await mkdtemp(join(tmpdir(), 'dd-agent-ctx-'));
    // ~4 chars/token heuristic fallback; well over the cap regardless of tokenizer.
    await writeFileAt(clonePath, 'specs/huge.md', 'x'.repeat((PER_DOC_TOKEN_CAP + 5000) * 4));
    const repoId = await makeRepo(clonePath);
    const agentId = await makeAgent(app);

    const post = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/context?repo_id=${repoId}`,
      payload: { paths: ['specs/huge.md'] },
    });
    expect(post.statusCode).toBe(422);

    const get = await app.inject({ method: 'GET', url: `/agents/${agentId}/context` });
    expect(get.json()).toEqual([]);

    await app.close();
  });

  it('rejects a submission whose aggregate exceeds AGGREGATE_TOKEN_CAP — persists nothing', async () => {
    const app = await makeApp();
    const clonePath = await mkdtemp(join(tmpdir(), 'dd-agent-ctx-'));
    // Each doc's token count is comfortably UNDER PER_DOC_TOKEN_CAP (45k of the
    // 50k cap), but four of them sum to 180k, over AGGREGATE_TOKEN_CAP (150k) —
    // isolates the aggregate check from the per-doc one. Repeated single-char
    // content maps to an exact chars/4 token count (the tokenizer's degenerate-
    // content heuristic path), so the token math here is deterministic.
    const perDocTokens = Math.floor(PER_DOC_TOKEN_CAP * 0.9);
    const perDocChars = perDocTokens * 4;
    await writeFileAt(clonePath, 'specs/a.md', 'a'.repeat(perDocChars));
    await writeFileAt(clonePath, 'specs/b.md', 'b'.repeat(perDocChars));
    await writeFileAt(clonePath, 'specs/c.md', 'c'.repeat(perDocChars));
    await writeFileAt(clonePath, 'specs/d.md', 'd'.repeat(perDocChars));
    const repoId = await makeRepo(clonePath);
    const agentId = await makeAgent(app);

    const post = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/context?repo_id=${repoId}`,
      payload: { paths: ['specs/a.md', 'specs/b.md', 'specs/c.md', 'specs/d.md'] },
    });
    expect(post.statusCode).toBe(422);

    const get = await app.inject({ method: 'GET', url: `/agents/${agentId}/context` });
    expect(get.json()).toEqual([]);

    await app.close();
  });

  it('rejects a path that fails realpath containment (traversal) — persists nothing', async () => {
    const app = await makeApp();
    const clonePath = await mkdtemp(join(tmpdir(), 'dd-agent-ctx-'));
    await writeFileAt(clonePath, 'specs/a.md', 'fine');
    const repoId = await makeRepo(clonePath);
    const agentId = await makeAgent(app);

    const post = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/context?repo_id=${repoId}`,
      payload: { paths: ['../../../../etc/passwd'] },
    });
    expect(post.statusCode).toBe(422);

    const get = await app.inject({ method: 'GET', url: `/agents/${agentId}/context` });
    expect(get.json()).toEqual([]);

    await app.close();
  });

  it('requires repo_id when attaching a non-empty path list', async () => {
    const app = await makeApp();
    const agentId = await makeAgent(app);

    const post = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/context`,
      payload: { paths: ['specs/a.md'] },
    });
    expect(post.statusCode).toBe(422);

    await app.close();
  });

  it('detaching everything (paths: []) never needs a repo_id', async () => {
    const app = await makeApp();
    const agentId = await makeAgent(app);

    const post = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/context`,
      payload: { paths: [] },
    });
    expect(post.statusCode).toBe(200);
    expect(post.json()).toEqual([]);

    await app.close();
  });
});
