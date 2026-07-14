import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { CiExportInput } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { CiService } from './service.js';

const CiRunsQuery = z.object({ agent_id: z.string().uuid().optional() });

/**
 * Export-to-CI + CI Runs module.
 *   POST /agents/:id/export-ci        → build/commit the bundle (AC-1..6, 13..18)
 *   GET  /agents/:id/ci-installations → an agent's CI installations
 *   GET  /agents/:id/ci-runs          → one agent's run history
 *   GET  /ci-runs[?agent_id=]         → workspace-wide (optionally agent-filtered) run list
 *   POST /ci-runs/refresh             → pull-ingest devdigest-review runs (AC-20..23)
 *
 * `workspaceId` is derived from `getContext()` on every route, never from
 * user input (server INSIGHTS 2026-07-02).
 */
export default async function ciRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new CiService(app.container);

  app.post(
    '/agents/:id/export-ci',
    {
      schema: { params: IdParams, body: CiExportInput },
      // GitHub-writing route (commit + PR) — same per-route cap as other
      // external-side-effect routes in this codebase (eval/onboarding/reviews).
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const result = await service.export(workspaceId, req.params.id, req.body, req.log);
      if (!result) throw new NotFoundError('Agent not found');
      reply.status(201);
      return result;
    },
  );

  app.get('/agents/:id/ci-installations', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const rows = await service.listInstallations(workspaceId, req.params.id);
    if (!rows) throw new NotFoundError('Agent not found');
    return rows;
  });

  app.get('/agents/:id/ci-runs', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const rows = await service.listRunsForAgent(workspaceId, req.params.id);
    if (!rows) throw new NotFoundError('Agent not found');
    return rows;
  });

  app.get('/ci-runs', { schema: { querystring: CiRunsQuery } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    if (req.query.agent_id) {
      const rows = await service.listRunsForAgent(workspaceId, req.query.agent_id);
      if (!rows) throw new NotFoundError('Agent not found');
      return rows;
    }
    return service.listRunsForWorkspace(workspaceId);
  });

  app.post(
    '/ci-runs/refresh',
    // Each call hits `listWorkflowRuns`/`downloadArtifact` per installation —
    // same GitHub-API-touching cap as export.
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.ingest(workspaceId, req.log);
    },
  );
}
