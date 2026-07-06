/**
 * stdio MCP server bootstrap for `@devdigest/mcp`. Registers exactly the 5
 * tools defined under `src/tools/` over the existing dev-digest Fastify API —
 * no Resources, no Prompts (see plan `docs/plans/mcp-server.md`, T4).
 *
 * IMPORTANT: stdout is the MCP stdio protocol channel — never write to it
 * directly. All diagnostics go through `log` (stderr only, `src/log.ts`).
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { config } from './config.js';
import { log } from './log.js';
import { getBlastRadiusTool } from './tools/get-blast-radius.js';
import { getConventionsTool } from './tools/get-conventions.js';
import { getFindingsTool } from './tools/get-findings.js';
import { listAgentsTool } from './tools/list-agents.js';
import { runReviewTool } from './tools/run-review.js';
import type { ToolDef } from './tools/tool.js';

const INSTRUCTIONS = [
  'Read-only access to dev-digest code review data: agents, findings, and conventions.',
  "Identifiers are human-readable, not uuids — repo is 'owner/name', pr is the PR number, " +
    'agent is the agent name.',
  'dev_digest_run_review is a paid LLM call that triggers and awaits a review; the other 4 tools ' +
    'are free and read-only.',
].join('\n');

const server = new McpServer(
  { name: 'devdigest-mcp', version: '0.0.0' },
  { instructions: INSTRUCTIONS },
);

// The SDK's `ShapeOutput<Shape>`/`CallToolResult` and our own `ToolDef`'s
// `z.infer<z.ZodObject<Shape>>`/`ToolResult` are structurally identical for
// any concrete Shape, but TS can't prove that equivalence through a shared
// generic type parameter across two independently-generic functions — this
// wiring boundary uses `any` rather than loosening `ToolDef`'s handler type.
function registerTool(tool: ToolDef<any>): void {
  server.registerTool(
    tool.name,
    {
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: tool.annotations,
    },
    async (args: Record<string, unknown>): Promise<CallToolResult> =>
      (await tool.handler(args)) as unknown as CallToolResult,
  );
}

registerTool(listAgentsTool);
registerTool(runReviewTool);
registerTool(getFindingsTool);
registerTool(getConventionsTool);
registerTool(getBlastRadiusTool);

let shuttingDown = false;

function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info(`received ${signal}, shutting down`);
  server
    .close()
    .catch((err: unknown) => log.error('error during shutdown', err instanceof Error ? err.message : err))
    .finally(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info(`devdigest-mcp connected via stdio (api=${config.apiUrl})`);
}

main().catch((err: unknown) => {
  log.error('failed to start', err instanceof Error ? err.message : err);
  process.exit(1);
});
