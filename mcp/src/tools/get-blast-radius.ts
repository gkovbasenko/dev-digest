/**
 * `get_blast_radius` — STUB. The full feature (L04: symbols/callers impacted
 * by a PR's changes) is not built yet. `repoIntel.getBlastRadius` exists on
 * the facade but no route is wired up to it — this tool deliberately does
 * NOT call the API and just returns a placeholder status (plan decision #4).
 */
import { z } from 'zod';
import { textResult } from './tool.js';
import type { ToolDef } from './tool.js';

const InputSchema = {
  repo: z.string().min(1).describe("Repo in 'owner/name' form"),
  pr: z.number().int().describe('Pull request number'),
};

export const getBlastRadiusTool: ToolDef<typeof InputSchema> = {
  name: 'get_blast_radius',
  description:
    "Get the blast radius (symbols and callers impacted by a pull request's changes). " +
    'Not yet implemented — returns a placeholder status; use get_findings for available ' +
    'review results.',
  inputSchema: InputSchema,
  annotations: { title: 'Get blast radius', readOnlyHint: true },
  handler: async () => {
    return textResult({
      status: 'not_implemented',
      hint:
        'Blast radius (L04) ще не реалізовано; скористайтесь get_findings для наявних ' +
        'результатів review.',
    });
  },
};
