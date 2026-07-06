/**
 * `ToolDef` — the shared contract every MCP tool implements. Kept intentionally
 * small: 5 tools total (list_agents, run_review, get_findings, get_conventions,
 * get_blast_radius), no Resources/Prompts, no dynamic tool discovery.
 *
 * Errors are returned as a structured tool result (`isError: true` + an
 * actionable message), never thrown — every branch should name the next
 * useful tool to call ("error leads forward").
 */
import type { ZodRawShape, z } from 'zod';

export interface ToolAnnotations {
  title?: string;
  /** True for the 4 read-only tools; false only for `run_review`. */
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  /** True when the tool has effects/dependencies outside dev-digest's own DB
   * (e.g. `run_review` triggers an LLM call). */
  openWorldHint?: boolean;
}

export interface ToolTextContent {
  type: 'text';
  text: string;
}

export interface ToolResult {
  content: ToolTextContent[];
  isError?: boolean;
}

export interface ToolDef<Shape extends ZodRawShape = ZodRawShape> {
  /** Tool name as exposed to the MCP client, e.g. 'list_agents'. */
  name: string;
  /** One-line description — token-conscious, no multi-paragraph prose. */
  description: string;
  /** Zod raw shape (flat scalars only — no nested objects, per design principles). */
  inputSchema: Shape;
  annotations: ToolAnnotations;
  handler: (args: z.infer<z.ZodObject<Shape>>) => Promise<ToolResult>;
}

/** Wrap a JSON-serializable value as a successful tool result. */
export function textResult(value: unknown): ToolResult {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return { content: [{ type: 'text', text }] };
}

/** Wrap an actionable error message as a failed tool result (not a thrown exception). */
export function errorResult(message: string): ToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}
