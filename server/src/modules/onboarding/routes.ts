import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { OnboardingService } from './service.js';

/**
 * Onboarding module — generate and read a repo-scoped onboarding tour.
 *   GET  /repos/:id/onboarding            → cached read, always 200 (AC-9)
 *   POST /repos/:id/onboarding/regenerate  → paid LLM generation, 200
 */
export default async function onboardingRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new OnboardingService(app.container);

  app.get('/repos/:id/onboarding', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.read(workspaceId, req.params.id);
  });

  app.post(
    '/repos/:id/onboarding/regenerate',
    // Same per-route cap as /conventions/extract and /pulls/:id/review — a
    // paid LLM call per request, tighter than the app-wide default.
    { schema: { params: IdParams }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.regenerate(workspaceId, req.params.id);
    },
  );
}
