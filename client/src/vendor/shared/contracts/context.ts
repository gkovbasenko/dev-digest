import { z } from 'zod';

/**
 * Project Context folder DTOs (F1: repo-scoped `.md` docs under `specs/`,
 * `docs/`, `insights/` that can be manually attached to an agent or a skill
 * and injected into the reviewer's `## Project context` untrusted block).
 *
 * No embeddings, no reindex — read-only discovery + paths-only attachment.
 */

// ---- Caps (identical enforcement in UI and API) ----
export const PER_DOC_TOKEN_CAP = 50000;
export const AGGREGATE_TOKEN_CAP = 150000;

// ---- Discovery ----
export const ContextBadge = z.enum(['specs', 'docs', 'insights']);
export type ContextBadge = z.infer<typeof ContextBadge>;

export const ContextDocument = z.object({
  path: z.string(),
  badge: ContextBadge,
  token_count: z.number().int(),
});
export type ContextDocument = z.infer<typeof ContextDocument>;

export const ContextDocList = z.object({
  indexed: z.boolean(),
  documents: z.array(ContextDocument),
});
export type ContextDocList = z.infer<typeof ContextDocList>;

// ---- Preview ----
export const ContextDocPreview = z.object({
  content: z.string(),
});
export type ContextDocPreview = z.infer<typeof ContextDocPreview>;

// ---- Attachment (agent/skill context: paths only, ordered) ----
export const SetContextInput = z.object({
  // .min(1): reject empty-string paths at the schema boundary (defense-in-depth;
  // server-side isAllowedContextPath + realpath containment remains the real guard).
  paths: z.array(z.string().min(1)),
});
export type SetContextInput = z.infer<typeof SetContextInput>;
