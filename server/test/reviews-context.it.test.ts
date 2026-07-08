import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const REVIEW_FIXTURE: Review = {
  verdict: 'approve',
  summary: 'Looks fine.',
  score: 90,
  findings: [],
};

/**
 * T6 — Project Context folder wiring into `run-executor.ts` (AC-5/9/11/12/15/16).
 *
 * Verifies: agent-attached + enabled-skill-inherited doc paths are collected,
 * deduped (agent-first, first occurrence wins), read fresh from the PR's clone,
 * and injected into the wrapUntrusted-wrapped `## Project context` block;
 * `prompt_assembly.specs` carries the exact injected text (AC-16, populated
 * automatically from `outcome.assembly`); a missing doc is skipped (Live Log
 * warning) and marked `(missing)` in `specs_read` without failing the run
 * (AC-12); attaching docs makes the SAME number of provider calls as an
 * unattached run (AC-15, zero new LLM calls).
 */
d('T6 review Project Context wiring (Testcontainers pg)', () => {
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

  async function appWith(llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE })) {
    return { app: await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: llm },
      },
    }), llm };
  }

  async function setupRepoAndPr(clonePath: string | null) {
    const name = `ctx-wiring-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}`, clonePath })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 501,
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
    await pg.handle.db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
    });
    return { repo: repo!, pr: pr! };
  }

  async function writeFileAt(root: string, rel: string, contents: string): Promise<void> {
    const full = join(root, rel);
    await mkdir(full.slice(0, full.lastIndexOf('/')), { recursive: true });
    await writeFile(full, contents, 'utf8');
  }

  it('injects agent + enabled-skill-inherited docs, deduped, into the wrapped Project context block', async () => {
    const { app } = await appWith();
    const clonePath = await mkdtemp(join(tmpdir(), 'dd-run-ctx-'));
    await writeFileAt(clonePath, 'specs/a.md', 'Rule A: no hardcoded secrets.');
    await writeFileAt(clonePath, 'specs/b.md', 'Rule B: use snake_case.');
    await writeFileAt(clonePath, 'specs/c.md', 'Rule C: guard clauses everywhere.');
    const { pr } = await setupRepoAndPr(clonePath);

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Context Reviewer', provider: 'openai', model: 'gpt-4.1', system_prompt: 'sec' },
      })
    ).json();

    // Agent attaches [a, b] directly (order preserved).
    await pg.handle.db.insert(t.agentContextDocs).values([
      { agentId: agent.id, path: 'specs/a.md', order: 0 },
      { agentId: agent.id, path: 'specs/b.md', order: 1 },
    ]);

    // An ENABLED skill linked to the agent inherits [b, c] — b is a duplicate
    // (already agent-attached) and must be injected only once.
    const [skill] = await pg.handle.db
      .insert(t.skills)
      .values({
        workspaceId,
        name: 'Inherits context',
        description: 'Carries its own context docs.',
        type: 'convention',
        source: 'manual',
        body: 'Follow the linked rules.',
        enabled: true,
        version: 1,
      })
      .returning();
    await pg.handle.db.insert(t.agentSkills).values({ agentId: agent.id, skillId: skill!.id, order: 0 });
    await pg.handle.db.insert(t.skillContextDocs).values([
      { skillId: skill!.id, path: 'specs/b.md', order: 0 },
      { skillId: skill!.id, path: 'specs/c.md', order: 1 },
    ]);

    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { agentId: agent.id },
    });
    expect(res.statusCode).toBe(200);
    const runId = res.json().runs[0].run_id;

    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();

    // Injected once each, agent-first order: a, b, c.
    expect(trace.specs_read).toEqual(['specs/a.md', 'specs/b.md', 'specs/c.md']);

    const specsBlock = trace.prompt_assembly.specs as string;
    expect(specsBlock).toContain('<untrusted source="specs/a.md">');
    expect(specsBlock).toContain('Rule A: no hardcoded secrets.');
    expect(specsBlock).toContain('<untrusted source="specs/b.md">');
    expect(specsBlock).toContain('Rule B: use snake_case.');
    expect(specsBlock).toContain('<untrusted source="specs/c.md">');
    expect(specsBlock).toContain('Rule C: guard clauses everywhere.');
    // b appears only once (deduped, agent-first wins).
    expect(specsBlock.split('source="specs/b.md"')).toHaveLength(2);

    const user = trace.prompt_assembly.user as string;
    expect(user).toContain('## Project context');

    await app.close();
  });

  it('skips a missing attached doc (Live Log warning, `(missing)` marker), keeps the run status "done"', async () => {
    const { app } = await appWith();
    const clonePath = await mkdtemp(join(tmpdir(), 'dd-run-ctx-'));
    await writeFileAt(clonePath, 'specs/present.md', 'This one exists.');
    const { pr } = await setupRepoAndPr(clonePath);

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Missing Doc Reviewer', provider: 'openai', model: 'gpt-4.1', system_prompt: 'sec' },
      })
    ).json();

    await pg.handle.db.insert(t.agentContextDocs).values([
      { agentId: agent.id, path: 'specs/present.md', order: 0 },
      { agentId: agent.id, path: 'specs/gone.md', order: 1 },
    ]);

    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { agentId: agent.id },
    });
    expect(res.statusCode).toBe(200);
    const runId = res.json().runs[0].run_id;

    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    const [run] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    expect(run?.status).toBe('done');

    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    expect(trace.specs_read).toEqual(['specs/present.md', 'specs/gone.md (missing)']);

    const specsBlock = trace.prompt_assembly.specs as string;
    expect(specsBlock).toContain('This one exists.');
    expect(specsBlock).not.toContain('specs/gone.md');

    // Live Log carries a warning naming the missing path.
    const logText = JSON.stringify(trace.log);
    expect(logText).toContain('specs/gone.md');

    await app.close();
  });

  it('makes the SAME number of provider calls whether or not docs are attached (AC-15)', async () => {
    const clonePath = await mkdtemp(join(tmpdir(), 'dd-run-ctx-'));
    await writeFileAt(clonePath, 'specs/a.md', 'Rule A.');

    // Run WITHOUT attachments.
    const without = await appWith();
    const { pr: pr1 } = await setupRepoAndPr(clonePath);
    const agent1 = (
      await without.app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'No Attach', provider: 'openai', model: 'gpt-4.1', system_prompt: 'sec' },
      })
    ).json();
    const res1 = await without.app.inject({
      method: 'POST',
      url: `/pulls/${pr1.id}/review`,
      payload: { agentId: agent1.id },
    });
    await waitForPrRuns(pg.handle.db, pr1.id, { expected: 1 });
    const callsWithout = without.llm.calls.length;
    await without.app.close();

    // Run WITH attachments.
    const withAttach = await appWith();
    const { pr: pr2 } = await setupRepoAndPr(clonePath);
    const agent2 = (
      await withAttach.app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'With Attach', provider: 'openai', model: 'gpt-4.1', system_prompt: 'sec' },
      })
    ).json();
    await pg.handle.db.insert(t.agentContextDocs).values({ agentId: agent2.id, path: 'specs/a.md', order: 0 });
    const res2 = await withAttach.app.inject({
      method: 'POST',
      url: `/pulls/${pr2.id}/review`,
      payload: { agentId: agent2.id },
    });
    await waitForPrRuns(pg.handle.db, pr2.id, { expected: 1 });
    const callsWith = withAttach.llm.calls.length;
    await withAttach.app.close();

    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);
    expect(callsWith).toBe(callsWithout);
    expect(callsWithout).toBeGreaterThan(0);
  });
});
