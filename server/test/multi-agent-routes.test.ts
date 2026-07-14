import { describe, it, expect, afterEach } from 'vitest';
import Fastify, { type FastifyInstance, type RouteOptions } from 'fastify';
import reviewsRoutes from '../src/modules/reviews/routes.js';
import type { Container } from '../src/platform/container.js';

/**
 * Rate-limit config for `POST /pulls/:id/multi-agent-run` (Non-functional —
 * same tight per-route limit as `/pulls/:id/review`, since each call fans out
 * to N paid LLM runs). Asserted via the registered route `config`, NOT a
 * burst of `app.inject()` calls — `@fastify/rate-limit` is disabled whenever
 * `config.nodeEnv === 'test'` (server INSIGHTS 2026-07-08), so a burst can
 * never actually 429 in this environment regardless of the route config.
 * Mirrors `brief-routes.test.ts`/`onboarding-routes.test.ts`.
 */
describe('Reviews (multi-agent) routes — rate limit config', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  function stubContainer(): Container {
    return {
      db: {},
      runBus: { publish: () => {}, subscribe: () => () => {}, onDone: () => () => {}, cancel: () => {}, complete: () => {} },
      agentsRepo: {},
    } as unknown as Container;
  }

  it('registers POST /pulls/:id/multi-agent-run with { max: 10, timeWindow: "1 minute" }', async () => {
    app = Fastify();
    app.decorate('container', stubContainer());

    const captured: RouteOptions[] = [];
    app.addHook('onRoute', (routeOptions) => {
      captured.push(routeOptions);
    });

    await app.register(reviewsRoutes);

    const trigger = captured.find(
      (r) => r.method === 'POST' && r.url === '/pulls/:id/multi-agent-run',
    );
    expect(trigger).toBeDefined();
    expect(trigger!.config).toEqual({ rateLimit: { max: 10, timeWindow: '1 minute' } });
  });

  it('does not apply the same rate-limit config to the read route GET /pulls/:id/multi-agent', async () => {
    app = Fastify();
    app.decorate('container', stubContainer());

    const captured: RouteOptions[] = [];
    app.addHook('onRoute', (routeOptions) => {
      captured.push(routeOptions);
    });

    await app.register(reviewsRoutes);

    const read = captured.find((r) => r.method === 'GET' && r.url === '/pulls/:id/multi-agent');
    expect(read).toBeDefined();
    expect(read!.config).not.toEqual({ rateLimit: { max: 10, timeWindow: '1 minute' } });
  });
});
