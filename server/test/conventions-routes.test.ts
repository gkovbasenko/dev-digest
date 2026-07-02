import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';

/**
 * Hermetic smoke tests for the conventions module routes — request validation
 * only, no DB required (postgres-js connects lazily).
 */

const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

describe('conventions routes (no DB)', () => {
  it('GET /repos/:id/conventions → 422 when :id is not a uuid', async () => {
    const app = await buildApp({ config });
    const res = await app.inject({ method: 'GET', url: '/repos/not-a-uuid/conventions' });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('POST /repos/:id/conventions/extract → 422 when :id is not a uuid', async () => {
    const app = await buildApp({ config });
    const res = await app.inject({
      method: 'POST',
      url: '/repos/not-a-uuid/conventions/extract',
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('PATCH /conventions/:id → 422 when :id is not a uuid', async () => {
    const app = await buildApp({ config });
    const res = await app.inject({
      method: 'PATCH',
      url: '/conventions/not-a-uuid',
      payload: { accepted: true },
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('PATCH /conventions/:id → 422 when both accepted and rejected are true', async () => {
    const app = await buildApp({ config });
    const res = await app.inject({
      method: 'PATCH',
      url: '/conventions/11111111-1111-1111-1111-111111111111',
      payload: { accepted: true, rejected: true },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
    await app.close();
  });

  it('PATCH /conventions/:id → 422 when category is not a string', async () => {
    const app = await buildApp({ config });
    const res = await app.inject({
      method: 'PATCH',
      url: '/conventions/11111111-1111-1111-1111-111111111111',
      payload: { category: 42 },
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('PATCH /conventions/:id → 422 when category is a string but not one of the known values', async () => {
    // category is constrained to the shared ConventionCategory enum, same as
    // the extraction pipeline's LLM-output validation — a plain z.string()
    // here would let an arbitrary value (e.g. a typo) persist silently,
    // since the client only renders badges for the known enum values.
    const app = await buildApp({ config });
    const res = await app.inject({
      method: 'PATCH',
      url: '/conventions/11111111-1111-1111-1111-111111111111',
      payload: { category: 'not-a-real-category' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
    await app.close();
  });
});
