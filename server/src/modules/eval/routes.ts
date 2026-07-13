import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { EvalService } from './service.js';

/** `/findings/:findingId/eval-case` addresses a finding, not an eval case. */
const FindingParams = z.object({ findingId: z.string().uuid() });

const DashboardQuery = z.object({ agentId: z.string().uuid().optional() });

const UpdateEvalCaseBody = z.object({
  name: z.string().min(1).optional(),
  input_diff: z.string().optional(),
  input_files: z.unknown().optional(),
  input_meta: z.unknown().optional(),
  expected_output: z.unknown().optional(),
  notes: z.string().nullish(),
});

/** Create-from-scratch payload; owner is the `:id` agent from the path. */
const CreateEvalCaseBody = z.object({
  name: z.string().min(1),
  input_diff: z.string().optional(),
  input_files: z.unknown().optional(),
  input_meta: z.unknown().optional(),
  expected_output: z.unknown().optional(),
  notes: z.string().nullish(),
});

/**
 * A4 — eval module (dashboard-and-eval-set half of L06).
 *   POST   /findings/:findingId/eval-case  → create (or de-dupe-return) a case from a finding
 *   GET    /agents/:id/eval-cases          → an agent's whole eval set
 *   POST   /agents/:id/eval-cases          → create a case from scratch (manual authoring)
 *   PUT    /eval-cases/:id                 → edit a case
 *   DELETE /eval-cases/:id                 → delete a case
 *   POST   /eval-cases/:id/run             → single-case run (AC-21 — editor "run on save")
 *   POST   /agents/:id/eval-runs           → whole-set run (AC-8)
 *   GET    /eval/dashboard[?agentId=]      → workspace dashboard, or one agent's detail
 *   GET    /agents/:id/eval-runs           → an agent's run history (trend/compare source)
 */
export default async function evalRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new EvalService(app.container);

  app.post(
    '/findings/:findingId/eval-case',
    { schema: { params: FindingParams } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const evalCase = await service.createFromFinding(workspaceId, req.params.findingId);
      reply.status(201);
      return evalCase;
    },
  );

  app.get('/agents/:id/eval-cases', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const cases = await service.listCasesForAgent(workspaceId, req.params.id);
    if (!cases) throw new NotFoundError('Agent not found');
    return cases;
  });

  app.post(
    '/agents/:id/eval-cases',
    { schema: { params: IdParams, body: CreateEvalCaseBody } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const evalCase = await service.createCase(workspaceId, req.params.id, req.body);
      if (!evalCase) throw new NotFoundError('Agent not found');
      reply.status(201);
      return evalCase;
    },
  );

  app.put(
    '/eval-cases/:id',
    { schema: { params: IdParams, body: UpdateEvalCaseBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const evalCase = await service.updateCase(workspaceId, req.params.id, req.body);
      if (!evalCase) throw new NotFoundError('Eval case not found');
      return evalCase;
    },
  );

  app.delete('/eval-cases/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const ok = await service.deleteCase(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Eval case not found');
    return { ok: true };
  });

  // Each call can trigger LLM runs (one per case) — tight per-route limit,
  // mirroring the reviews module's `/pulls/:id/review`.
  app.post(
    '/eval-cases/:id/run',
    { schema: { params: IdParams }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const result = await service.runCase(workspaceId, req.params.id);
      if (!result) throw new NotFoundError('Eval case not found');
      return result;
    },
  );

  app.post(
    '/agents/:id/eval-runs',
    { schema: { params: IdParams }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const result = await service.runAgentSet(workspaceId, req.params.id);
      if (!result) throw new NotFoundError('Agent not found');
      return result;
    },
  );

  app.get('/eval/dashboard', { schema: { querystring: DashboardQuery } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.getDashboard(workspaceId, req.query.agentId);
  });

  app.get('/agents/:id/eval-runs', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const runs = await service.listRunsForAgent(workspaceId, req.params.id);
    if (!runs) throw new NotFoundError('Agent not found');
    return runs;
  });
}
