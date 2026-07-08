import { describe, it, expect, afterEach } from 'vitest';
import Fastify, { type FastifyInstance, type RouteOptions } from 'fastify';
import reviewsRoutes from '../src/modules/reviews/routes.js';
import type { Container } from '../src/platform/container.js';

/**
 * AC-4 (rate limit): asserts `POST /pulls/:id/brief` is *registered* with the
 * expected per-route `config.rateLimit`, without depending on
 * `@fastify/rate-limit` actually being active — `buildApp()` disables that
 * plugin whenever `config.nodeEnv === 'test'` (server INSIGHTS 2026-07-08), so
 * a burst of `app.inject()` calls in the normal test environment would never
 * 429 regardless of the route config. Route `config` is plain data Fastify
 * stores at registration time, independent of any plugin — capturing it via
 * an `onRoute` hook is a hermetic, DB-free way to verify AC-4.
 *
 * `ReviewService`'s constructor only stores `container`/builds sub-collaborators
 * without touching the DB synchronously (mirrors `onboarding-routes.test.ts`),
 * so a minimal stub container is enough to register the module's routes.
 */
describe('Reviews (brief) routes — AC-4 rate limit config', () => {
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

  it('registers POST /pulls/:id/brief with { max: 10, timeWindow: "1 minute" }', async () => {
    app = Fastify();
    app.decorate('container', stubContainer());

    const captured: RouteOptions[] = [];
    app.addHook('onRoute', (routeOptions) => {
      captured.push(routeOptions);
    });

    await app.register(reviewsRoutes);

    const briefPost = captured.find((r) => r.method === 'POST' && r.url === '/pulls/:id/brief');
    expect(briefPost).toBeDefined();
    expect(briefPost!.config).toEqual({ rateLimit: { max: 10, timeWindow: '1 minute' } });
  });

  it('does not apply the same rate-limit config to the cached GET read route', async () => {
    app = Fastify();
    app.decorate('container', stubContainer());

    const captured: RouteOptions[] = [];
    app.addHook('onRoute', (routeOptions) => {
      captured.push(routeOptions);
    });

    await app.register(reviewsRoutes);

    const briefGet = captured.find((r) => r.method === 'GET' && r.url === '/pulls/:id/brief');
    expect(briefGet).toBeDefined();
    expect(briefGet!.config).not.toEqual({ rateLimit: { max: 10, timeWindow: '1 minute' } });
  });
});
