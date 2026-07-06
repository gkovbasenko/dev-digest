/**
 * `list_agents` — compact list of the review agents configured in this
 * workspace. Read-only, no resolvers needed (calls `GET /agents` directly).
 */
import { apiClient } from '../api-client.js';
import type { AgentLite } from '../types.js';
import { errorResult, textResult } from './tool.js';
import type { ToolDef } from './tool.js';

const InputSchema = {};

interface CompactAgent {
  name: string;
  provider: string;
  model: string;
  enabled: boolean;
  description: string;
}

export const listAgentsTool: ToolDef<typeof InputSchema> = {
  name: 'dev_digest_list_agents',
  description:
    'List the review agents configured in this workspace, with name, provider, model, ' +
    'and enabled state. Use the returned names as the agent argument for dev_digest_run_review.',
  inputSchema: InputSchema,
  annotations: { title: 'List agents', readOnlyHint: true },
  handler: async () => {
    const res = await apiClient.get<AgentLite[]>('/agents');
    if (!res.ok) return errorResult(res.error);

    const agents: CompactAgent[] = res.data.map((a) => ({
      name: a.name,
      provider: a.provider,
      model: a.model,
      enabled: a.enabled,
      description: a.description,
    }));
    return textResult({ agents });
  },
};
