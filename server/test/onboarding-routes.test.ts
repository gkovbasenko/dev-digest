import { describe, it, expect, afterEach } from 'vitest';
import Fastify, { type FastifyInstance, type RouteOptions } from 'fastify';
import onboardingRoutes from '../src/modules/onboarding/routes.js';
import type { Container } from '../src/platform/container.js';

/**
 * AC-4 (rate limit): asserts the regenerate route is *registered* with the
 * expected per-route `config.rateLimit`, without depending on
 * `@fastify/rate-limit` actually being active — `buildApp()` disables that
 * plugin whenever `config.nodeEnv === 'test'` (see `src/app.ts`), so a burst
 * of `app.inject()` calls in the normal test environment would never 429
 * regardless of the route config. Route `config` is plain data stored by
 * Fastify at registration time independent of any plugin, so capturing it via
 * an `onRoute` hook is a hermetic, plugin-independent way to verify AC-4.
 *
 * `OnboardingService`'s constructor only stores `container`/`container.db`
 * (never touches it synchronously), so a minimal stub container is enough to
 * register the module's routes without a real DB.
 */
describe('Onboarding routes — AC-4 rate limit config', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('registers POST /repos/:id/onboarding/regenerate with { max: 10, timeWindow: "1 minute" }', async () => {
    app = Fastify();
    app.decorate('container', { db: {} } as unknown as Container);

    const captured: RouteOptions[] = [];
    app.addHook('onRoute', (routeOptions) => {
      captured.push(routeOptions);
    });

    await app.register(onboardingRoutes);

    const regenerateRoute = captured.find(
      (r) => r.method === 'POST' && r.url === '/repos/:id/onboarding/regenerate',
    );
    expect(regenerateRoute).toBeDefined();
    expect(regenerateRoute!.config).toEqual({ rateLimit: { max: 10, timeWindow: '1 minute' } });
  });

  it('does not apply the same rate-limit config to the cached GET read route', async () => {
    app = Fastify();
    app.decorate('container', { db: {} } as unknown as Container);

    const captured: RouteOptions[] = [];
    app.addHook('onRoute', (routeOptions) => {
      captured.push(routeOptions);
    });

    await app.register(onboardingRoutes);

    const readRoute = captured.find((r) => r.method === 'GET' && r.url === '/repos/:id/onboarding');
    expect(readRoute).toBeDefined();
    expect(readRoute!.config).not.toEqual({ rateLimit: { max: 10, timeWindow: '1 minute' } });
  });
});
