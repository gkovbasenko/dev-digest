import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { SkillType } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { ConventionsService } from './service.js';

/**
 * Conventions module — extract, review, and bundle repo coding conventions.
 *   POST   /repos/:id/conventions/extract  → run extraction, 201, ConventionCandidate[]
 *   GET    /repos/:id/conventions          → list all candidates for the repo
 *   PATCH  /conventions/:id                → edit rule/category, accept, or (soft) reject
 *   POST   /repos/:id/conventions/bundle   → format accepted candidates into a skill body
 *                                             (does not write to the DB — the client creates
 *                                             the skill and links it to an agent)
 */

const UpdateConventionBody = z
  .object({
    rule: z.string().min(1).optional(),
    category: z.string().nullable().optional(),
    accepted: z.boolean().optional(),
    rejected: z.boolean().optional(),
  })
  .refine((b) => !(b.accepted === true && b.rejected === true), {
    message: 'A candidate cannot be both accepted and rejected',
  });

const SkillBundleResponse = z.object({
  name: z.string(),
  description: z.string(),
  type: SkillType,
  body: z.string(),
});

export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ConventionsService(app.container);

  app.post(
    '/repos/:id/conventions/extract',
    { schema: { params: IdParams } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const candidates = await service.extract(workspaceId, req.params.id);
      reply.status(201);
      return candidates;
    },
  );

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId, req.params.id);
  });

  app.patch(
    '/conventions/:id',
    { schema: { params: IdParams, body: UpdateConventionBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const candidate = await service.update(workspaceId, req.params.id, req.body);
      if (!candidate) throw new NotFoundError('Convention candidate not found');
      return candidate;
    },
  );

  app.post(
    '/repos/:id/conventions/bundle',
    { schema: { params: IdParams, response: { 200: SkillBundleResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.bundleIntoSkill(workspaceId, req.params.id);
    },
  );
}
