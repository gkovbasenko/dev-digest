/**
 * `get_conventions` — compact list of coding conventions extracted for a repo.
 */
import { z } from 'zod';
import { apiClient } from '../api-client.js';
import { resolveRepo } from '../resolve.js';
import type { ConventionLite } from '../types.js';
import { errorResult, textResult } from './tool.js';
import type { ToolDef } from './tool.js';

const InputSchema = {
  repo: z.string().min(1).describe("Repo in 'owner/name' form"),
};

export const getConventionsTool: ToolDef<typeof InputSchema> = {
  name: 'dev_digest_get_conventions',
  description:
    'Get the coding conventions extracted for a repository, as a concise list ' +
    '(rule, category, accepted).',
  inputSchema: InputSchema,
  annotations: { title: 'Get conventions', readOnlyHint: true },
  handler: async ({ repo }) => {
    const repoResolved = await resolveRepo(repo);
    if (!repoResolved.ok) return errorResult(repoResolved.error);

    const res = await apiClient.get<ConventionLite[]>(`/repos/${repoResolved.id}/conventions`);
    if (!res.ok) return errorResult(res.error);

    const conventions = res.data.map((c) => ({
      rule: c.rule,
      category: c.category,
      accepted: c.accepted,
    }));
    return textResult({ conventions });
  },
};
