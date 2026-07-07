import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { SkillsRepository } from '../src/modules/skills/repository.js';
import { SkillsService } from '../src/modules/skills/service.js';
import type { Container } from '../src/platform/container.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills-versions-stats] Docker not available — skipping integration tests.');
}

/**
 * Skill version history, restore, and usage stats
 * (GET /skills/:id/versions, GET /skills/:id/stats, POST /skills/:id/restore).
 *
 * Covers: version history accumulates on body-changing updates and is
 * returned newest-first; restore reuses SkillsRepository.update() so
 * restoring an old version APPENDS a new version with that old body (history
 * is never rewritten); stats aggregate agent links, version count, and
 * run_skills usage; 404s for an unknown id; workspace scoping.
 */
d('Skill versions, restore, and stats', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
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

  it('version history accumulates on body changes and is returned newest-first', async () => {
    const app = await makeApp();

    const created = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: 'Versioned Skill', body: '# v1\nBody.' },
    });
    expect(created.statusCode).toBe(201);
    const skillId = created.json().id as string;

    await app.inject({
      method: 'PUT',
      url: `/skills/${skillId}`,
      payload: { body: '# v2\nBody.' },
    });
    await app.inject({
      method: 'PUT',
      url: `/skills/${skillId}`,
      payload: { body: '# v3\nBody.' },
    });

    const res = await app.inject({ method: 'GET', url: `/skills/${skillId}/versions` });
    expect(res.statusCode).toBe(200);
    const versions = res.json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([3, 2, 1]);
    expect(versions[0].body).toBe('# v3\nBody.');
    expect(versions[2].body).toBe('# v1\nBody.');
    expect(typeof versions[0].created_at).toBe('string');

    await app.close();
  });

  it('restore appends a NEW version whose body equals the restored version, not a rewrite of history', async () => {
    const app = await makeApp();

    const created = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: 'Restore Test Skill', body: '# v1\nOriginal.' },
    });
    const skillId = created.json().id as string;

    await app.inject({
      method: 'PUT',
      url: `/skills/${skillId}`,
      payload: { body: '# v2\nChanged.' },
    });

    const restored = await app.inject({
      method: 'POST',
      url: `/skills/${skillId}/restore`,
      payload: { version: 1 },
    });
    expect(restored.statusCode).toBe(200);
    expect(restored.json().body).toBe('# v1\nOriginal.');
    expect(restored.json().version).toBe(3);

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${skillId}/versions` })
    ).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([3, 2, 1]);
    expect(versions[0].body).toBe('# v1\nOriginal.');

    await app.close();
  });

  it('restore 404s for an unknown skill id and an unknown version', async () => {
    const app = await makeApp();
    const ghost = '00000000-0000-0000-0000-000000000000';

    const missingSkill = await app.inject({
      method: 'POST',
      url: `/skills/${ghost}/restore`,
      payload: { version: 1 },
    });
    expect(missingSkill.statusCode).toBe(404);

    const created = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: 'No Such Version Skill', body: '# v1\nBody.' },
    });
    const skillId = created.json().id as string;

    const missingVersion = await app.inject({
      method: 'POST',
      url: `/skills/${skillId}/restore`,
      payload: { version: 99 },
    });
    expect(missingVersion.statusCode).toBe(404);

    await app.close();
  });

  it('stats reflect version_count, agent_count, run_usage_count, and last_used_at', async () => {
    const { db } = pg.handle;
    const app = await makeApp();

    const created = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: 'Stats Test Skill', body: '# v1\nBody.' },
    });
    const skillId = created.json().id as string;

    // No usage yet.
    const empty = await app.inject({ method: 'GET', url: `/skills/${skillId}/stats` });
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toMatchObject({
      agent_count: 0,
      version_count: 1,
      run_usage_count: 0,
      last_used_at: null,
      source: 'manual',
    });
    expect(typeof empty.json().created_at).toBe('string');

    // One more body-changing update → version_count becomes 2.
    await app.inject({
      method: 'PUT',
      url: `/skills/${skillId}`,
      payload: { body: '# v2\nBody.' },
    });

    // Link an agent to this skill.
    const agent = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: 'Stats Test Agent',
        provider: 'openai',
        model: 'gpt-4o-mini',
        system_prompt: 'Review the diff.',
      },
    });
    const agentId = agent.json().id as string;
    await db.insert(t.agentSkills).values({ agentId, skillId, order: 0 });

    // A run that used this skill.
    const [ws] = await db
      .select({ id: t.workspaces.id })
      .from(t.workspaces)
      .where(eq(t.workspaces.name, 'default'));
    const [run] = await db
      .insert(t.agentRuns)
      .values({ workspaceId: ws!.id })
      .returning();
    await db.insert(t.runSkills).values({ runId: run!.id, skillId, version: 2 });

    const res = await app.inject({ method: 'GET', url: `/skills/${skillId}/stats` });
    expect(res.statusCode).toBe(200);
    const stats = res.json();
    expect(stats.version_count).toBe(2);
    expect(stats.agent_count).toBe(1);
    expect(stats.run_usage_count).toBe(1);
    expect(typeof stats.last_used_at).toBe('string');

    await app.close();
  });

  it('stats 404s for a skill id that never existed', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'GET',
      url: '/skills/00000000-0000-0000-0000-000000000000/stats',
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('versions 404s for a skill id that never existed', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'GET',
      url: '/skills/00000000-0000-0000-0000-000000000000/versions',
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('versions, stats, and restore are workspace-scoped: another tenant is denied', async () => {
    const { db } = pg.handle;
    const [otherWs] = await db.insert(t.workspaces).values({ name: 'other-skills-ws' }).returning();
    const repo = new SkillsRepository(db);
    const foreign = await repo.insert({
      workspaceId: otherWs!.id,
      name: 'Foreign Skill',
      type: 'custom',
      source: 'manual',
      body: '# v1\nBody.',
    });

    const service = new SkillsService({ db } as unknown as Container);
    const [{ id: defaultWs }] = await db
      .select({ id: t.workspaces.id })
      .from(t.workspaces)
      .where(eq(t.workspaces.name, 'default'));

    // Owner workspace can read; the default workspace is denied (undefined →
    // 404 at the route, not an empty list that masks a cross-tenant skill).
    expect(await service.listVersions(otherWs!.id, foreign.id)).toHaveLength(1);
    expect(await service.listVersions(defaultWs!, foreign.id)).toBeUndefined();
    expect(await service.getStats(otherWs!.id, foreign.id)).toBeDefined();
    expect(await service.getStats(defaultWs!, foreign.id)).toBeUndefined();
    expect(await service.restore(defaultWs!, foreign.id, 1)).toBeUndefined();
  });
});
