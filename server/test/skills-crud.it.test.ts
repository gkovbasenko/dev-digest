import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills-crud] Docker not available — skipping integration tests.');
}

/**
 * Full CRUD lifecycle for the skills routes/service/repository — only
 * import()'s success path (skills-import.it.test.ts) and update()'s
 * concurrency behavior (skills-concurrency.it.test.ts) had integration
 * coverage; create/list/get/update/delete's happy paths (and defaults —
 * type/enabled defaulting on create, snapshotting on insert) never ran
 * against a real DB before.
 */
d('Skills CRUD lifecycle (POST/GET/PUT/DELETE /skills)', () => {
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

  it('create defaults type=custom, enabled=true, version=1 when omitted', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: 'Defaults Test', body: '# Rule\nBody.' },
    });
    expect(res.statusCode).toBe(201);
    const skill = res.json();
    expect(skill.type).toBe('custom');
    expect(skill.enabled).toBe(true);
    expect(skill.version).toBe(1);
    expect(skill.source).toBe('manual');
    await app.close();
  });

  it('create honors explicit type and enabled=false', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: 'Explicit Test', body: '# Rule\nBody.', type: 'security', enabled: false },
    });
    expect(res.statusCode).toBe(201);
    const skill = res.json();
    expect(skill.type).toBe('security');
    expect(skill.enabled).toBe(false);
    await app.close();
  });

  it('the full lifecycle: create -> appears in list -> get by id -> update -> delete -> 404s after', async () => {
    const app = await makeApp();

    const created = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: 'Lifecycle Test', body: '# v1\nBody.' },
    });
    expect(created.statusCode).toBe(201);
    const skillId = created.json().id;

    // list contains it
    const list = await app.inject({ method: 'GET', url: '/skills' });
    expect(list.statusCode).toBe(200);
    expect(list.json().some((s: { id: string }) => s.id === skillId)).toBe(true);

    // get by id
    const got = await app.inject({ method: 'GET', url: `/skills/${skillId}` });
    expect(got.statusCode).toBe(200);
    expect(got.json().name).toBe('Lifecycle Test');
    expect(got.json().version).toBe(1);

    // update bumps version only on body change
    const renamed = await app.inject({
      method: 'PUT',
      url: `/skills/${skillId}`,
      payload: { name: 'Renamed' },
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json().name).toBe('Renamed');
    expect(renamed.json().version).toBe(1);

    const rebodied = await app.inject({
      method: 'PUT',
      url: `/skills/${skillId}`,
      payload: { body: '# v2\nBody.' },
    });
    expect(rebodied.statusCode).toBe(200);
    expect(rebodied.json().body).toBe('# v2\nBody.');
    expect(rebodied.json().version).toBe(2);

    // delete
    const deleted = await app.inject({ method: 'DELETE', url: `/skills/${skillId}` });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json()).toEqual({ ok: true });

    // gone
    const after = await app.inject({ method: 'GET', url: `/skills/${skillId}` });
    expect(after.statusCode).toBe(404);

    const deleteAgain = await app.inject({ method: 'DELETE', url: `/skills/${skillId}` });
    expect(deleteAgain.statusCode).toBe(404);

    await app.close();
  });

  it('GET /skills/:id 404s for an id that never existed', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'GET',
      url: '/skills/00000000-0000-0000-0000-000000000000',
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('PUT /skills/:id 404s for an id that never existed', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/skills/00000000-0000-0000-0000-000000000000',
      payload: { name: 'Nope' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
