import { describe, it, expect, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';

/**
 * Hermetic smoke tests for the skills module routes. Only exercises request
 * validation and the community stub — no DB required (postgres-js connects lazily).
 *
 * Key invariant checked: GET /skills/community and POST /skills/import are not
 * swallowed by the GET /skills/:id UUID-param route (registration-order guard).
 */

const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

describe('skills routes (no DB)', () => {
  it('GET /skills/community → 200 []  (not a 422 UUID parse error)', async () => {
    const app = await buildApp({ config });
    const res = await app.inject({ method: 'GET', url: '/skills/community' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
    await app.close();
  });

  it('POST /skills/import → 422 when neither markdown nor url is provided', async () => {
    const app = await buildApp({ config });
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import',
      payload: { name: 'test' }, // missing markdown AND url
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
    await app.close();
  });

  it('POST /skills/import → 422 when url is not a valid URL string', async () => {
    const app = await buildApp({ config });
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import',
      payload: { url: 'not-a-url' },
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('POST /skills/import → 422 when both markdown and url are provided', async () => {
    // Otherwise service.import() silently prefers url and drops the pasted
    // markdown with no indication to the caller — reject the ambiguous
    // request instead.
    const app = await buildApp({ config });
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import',
      payload: { markdown: '# Rule\nBody.', url: 'https://example.com/skill.md' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
    await app.close();
  });

  it('POST /skills → 422 when required fields are missing', async () => {
    const app = await buildApp({ config });
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: 'My Skill' }, // missing body
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('POST /skills → 422 when type is not a valid enum value', async () => {
    const app = await buildApp({ config });
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: 'My Skill', body: '# Rule\nDo the thing.', type: 'invalid-type' },
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });
});
