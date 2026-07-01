import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { UNTRUSTED_SKILL_START, UNTRUSTED_SKILL_END } from '../src/modules/skills/constants.js';

// fetchSkillUrl has its own thorough SSRF unit coverage in skills-fetch.test.ts;
// here we only need a canned response so the URL-import path can be exercised
// through the real app + DB without a network call.
vi.mock('../src/modules/skills/fetch-skill.js', () => ({
  fetchSkillUrl: vi.fn().mockResolvedValue('# Fetched Skill\nBody from the URL.'),
}));

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills-import] Docker not available — skipping integration tests.');
}

/**
 * `SkillsService.import()` carries the security-relevant behavior for
 * untrusted skill content: every imported skill (markdown paste or URL) must
 * land disabled and delimiter-wrapped so it can't reach an agent prompt
 * un-vetted. No test previously drove this through the real routes + DB —
 * skills-routes.test.ts only covers the 422 validation paths, and
 * skills-concurrency.it.test.ts only exercises repository.update(). This
 * covers the actual insert path end-to-end.
 */
d('POST /skills and /skills/import — service behavior', () => {
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

  it('POST /skills (manual create) defaults enabled=true, source=manual, body unwrapped', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: 'Hand-written rule', body: '# Rule\nAlways do the thing.' },
    });
    expect(res.statusCode).toBe(201);
    const skill = res.json();
    expect(skill.source).toBe('manual');
    expect(skill.enabled).toBe(true);
    expect(skill.body).toBe('# Rule\nAlways do the thing.');
    await app.close();
  });

  it('POST /skills/import with markdown: disabled, wrapped, name derived from the first heading', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import',
      payload: { markdown: '# Pasted Skill\nDo the pasted thing.' },
    });
    expect(res.statusCode).toBe(201);
    const skill = res.json();
    expect(skill.source).toBe('imported_markdown');
    expect(skill.enabled).toBe(false);
    expect(skill.name).toBe('Pasted Skill');
    expect(skill.body.startsWith(UNTRUSTED_SKILL_START)).toBe(true);
    expect(skill.body.endsWith(UNTRUSTED_SKILL_END)).toBe(true);
    expect(skill.body).toContain('Do the pasted thing.');
    await app.close();
  });

  it('POST /skills/import with a url: disabled, wrapped, source=imported_url, body comes from fetchSkillUrl', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import',
      payload: { url: 'https://example.com/skill.md' },
    });
    expect(res.statusCode).toBe(201);
    const skill = res.json();
    expect(skill.source).toBe('imported_url');
    expect(skill.enabled).toBe(false);
    expect(skill.name).toBe('Fetched Skill');
    expect(skill.body).toContain('Body from the URL.');
    expect(skill.body.startsWith(UNTRUSTED_SKILL_START)).toBe(true);
    await app.close();
  });

  it('POST /skills/import: an explicit name overrides the heading-derived one', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import',
      payload: { markdown: '# Heading Name\nBody.', name: 'Custom Name' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().name).toBe('Custom Name');
    await app.close();
  });

  it('POST /skills/import: no heading and no explicit name falls back to "Imported Skill"', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import',
      payload: { markdown: 'Just a paragraph, no heading.' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().name).toBe('Imported Skill');
    await app.close();
  });
});
