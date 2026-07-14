import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  Skill,
  SkillType,
  CommunitySkill,
  SkillVersion,
  SkillStats,
  SetContextInput,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { SkillsService } from './service.js';

/**
 * A1 — skills module.
 *   GET    /skills                → list (workspace-scoped)
 *   POST   /skills                → create (manual, enabled)
 *   POST   /skills/import         → import markdown or URL (untrusted, disabled)
 *   GET    /skills/community      → stub (returns [])
 *   GET    /skills/:id            → one skill
 *   PUT    /skills/:id            → update (body change bumps version)
 *   DELETE /skills/:id            → delete
 *   GET    /skills/:id/versions   → version history (DESC)
 *   GET    /skills/:id/stats      → usage stats (agents, versions, run usage)
 *   POST   /skills/:id/restore    → restore an old version's body as a new version
 *   GET    /skills/:id/context    → attached Project Context doc paths (ordered)
 *   POST   /skills/:id/context    → set/reorder attached doc paths (?repo_id=… + caps)
 *
 * IMPORTANT: /skills/import and /skills/community are registered BEFORE /skills/:id
 * so Fastify does not attempt to match "import"/"community" as UUID params.
 */

const CreateSkillBody = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  type: SkillType,
  body: z.string().min(1),
  enabled: z.boolean().optional(),
});

const UpdateSkillBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  type: SkillType.optional(),
  body: z.string().optional(),
  enabled: z.boolean().optional(),
});

const RestoreSkillBody = z.object({
  version: z.number().int(),
});

/**
 * `repo_id` names the repo the submitted paths were discovered from — needed
 * to read + cap-check each doc before persisting. Required only when `paths`
 * is non-empty (detaching everything needs no repo).
 */
const SetContextQuery = z.object({ repo_id: z.string().uuid().optional() });

const ImportSkillBody = z
  .object({
    markdown: z.string().optional(),
    url: z.string().url().optional(),
    name: z.string().optional(),
  })
  .refine((b) => b.markdown !== undefined || b.url !== undefined, {
    message: 'Provide markdown or url',
  })
  .refine((b) => b.markdown === undefined || b.url === undefined, {
    message: 'Provide only one of markdown or url, not both',
  });

export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new SkillsService(app.container);

  app.get('/skills', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  app.post('/skills', { schema: { body: CreateSkillBody } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.create(workspaceId, req.body);
    reply.status(201);
    return skill;
  });

  // Must be before /skills/:id
  app.post('/skills/import', { schema: { body: ImportSkillBody } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.import(workspaceId, req.body);
    reply.status(201);
    return skill;
  });

  // Must be before /skills/:id
  // Not implemented yet — always [] until a community catalog exists. The
  // response schema pins the eventual shape (CommunitySkill[]) now, so a
  // future implementation can't accidentally return something the client
  // doesn't expect without the schema itself flagging the mismatch.
  app.get(
    '/skills/community',
    { schema: { response: { 200: z.array(CommunitySkill) } } },
    async () => [],
  );

  app.get('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.get(workspaceId, req.params.id);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.put(
    '/skills/:id',
    { schema: { params: IdParams, body: UpdateSkillBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.update(workspaceId, req.params.id, req.body);
      if (!skill) throw new NotFoundError('Skill not found');
      return skill;
    },
  );

  app.delete('/skills/:id', { schema: { params: IdParams } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const ok = await service.delete(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Skill not found');
    reply.status(204);
  });

  app.get(
    '/skills/:id/versions',
    { schema: { params: IdParams, response: { 200: z.array(SkillVersion) } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const versions = await service.listVersions(workspaceId, req.params.id);
      if (!versions) throw new NotFoundError('Skill not found');
      return versions;
    },
  );

  app.get(
    '/skills/:id/stats',
    { schema: { params: IdParams, response: { 200: SkillStats } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const stats = await service.getStats(workspaceId, req.params.id);
      if (!stats) throw new NotFoundError('Skill not found');
      return stats;
    },
  );

  app.post(
    '/skills/:id/restore',
    { schema: { params: IdParams, body: RestoreSkillBody, response: { 200: Skill } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.restore(workspaceId, req.params.id, req.body.version);
      if (!skill) throw new NotFoundError('Skill not found');
      return skill;
    },
  );

  app.get('/skills/:id/context', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const links = await service.getContextDocs(workspaceId, req.params.id);
    if (!links) throw new NotFoundError('Skill not found');
    return links;
  });

  app.post(
    '/skills/:id/context',
    { schema: { params: IdParams, querystring: SetContextQuery, body: SetContextInput } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const links = await service.setContextDocs(
        workspaceId,
        req.params.id,
        req.query.repo_id,
        req.body.paths,
      );
      if (!links) throw new NotFoundError('Skill not found');
      return links;
    },
  );
}
