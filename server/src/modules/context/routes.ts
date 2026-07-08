import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ContextDocList, ContextDocPreview } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { ContextService } from './service.js';

/**
 * Project Context module — read-only discovery + preview of a repo's `.md`
 * docs under the configured root folders (specs/docs/insights by default).
 * No write/create/upload/reindex endpoint — attachment persistence lives in
 * the `agents`/`skills` modules (their own `/context` sub-routes).
 *
 *   GET /repos/:id/context             → ContextDocList
 *   GET /repos/:id/context/file?path=… → ContextDocPreview
 */

const FileQuery = z.object({ path: z.string().min(1) });

export default async function contextRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ContextService(app.container);

  app.get(
    '/repos/:id/context',
    { schema: { params: IdParams, response: { 200: ContextDocList } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.discover(workspaceId, req.params.id);
    },
  );

  app.get(
    '/repos/:id/context/file',
    { schema: { params: IdParams, querystring: FileQuery, response: { 200: ContextDocPreview } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const preview = await service.preview(workspaceId, req.params.id, req.query.path);
      if (!preview) throw new NotFoundError('Document not found');
      return preview;
    },
  );
}
