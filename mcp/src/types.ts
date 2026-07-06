/**
 * Local minimal `*Lite` types for the fields this package actually reads from
 * the dev-digest API responses.
 *
 * These mirror a SUBSET of the server's Zod contracts
 * (`server/src/vendor/shared/contracts/*.ts`) — deliberately NOT imported.
 * `client/src/vendor/shared/` is already an unenforced manual mirror of those
 * contracts (root `INSIGHTS.md`, 2026-06-29); importing `@devdigest/shared`
 * here would create a third manual mirror and couple this package to the
 * server's build/lockfile. This is a conscious tradeoff: if a server contract
 * shape changes, these `*Lite` types can silently drift — `tsc` will not
 * catch it. Keep each type to only the fields actually consumed below, and
 * re-check against the server contracts when a tool reads a new field.
 *
 * Sources (for grounding, not import):
 *  - AgentLite      ← server/src/vendor/shared/contracts/knowledge.ts `Agent`
 *  - RepoLite       ← server/src/vendor/shared/contracts/platform.ts `Repo`
 *  - PrLite         ← server/src/vendor/shared/contracts/platform.ts `PrMeta`
 *  - RunLite        ← server/src/vendor/shared/contracts/trace.ts `RunSummary`
 *  - ReviewLite     ← server/src/modules/reviews/helpers.ts `ReviewDto`
 *  - FindingLite    ← server/src/modules/reviews/helpers.ts `ReviewDtoFinding`
 *                       (server/src/vendor/shared/contracts/findings.ts `Finding`)
 *  - ConventionLite ← server/src/vendor/shared/contracts/knowledge.ts `ConventionCandidate`
 */

/** GET /agents — subset of Agent used by list_agents / resolveAgent. */
export interface AgentLite {
  id: string;
  name: string;
  description: string;
  provider: string;
  model: string;
  enabled: boolean;
}

/** GET /repos — subset of Repo used by resolveRepo. */
export interface RepoLite {
  id: string;
  full_name: string;
}

/** GET /repos/:id/pulls — subset of PrMeta used by resolvePr. `id` is nullish
 * when the PR hasn't been imported yet (see resolve.ts). */
export interface PrLite {
  id?: string | null;
  number: number;
}

/** GET /pulls/:id/runs (and /runs/active) — subset of RunSummary used by
 * wait-for-run polling and error-forwarding. */
export interface RunLite {
  run_id: string;
  status: string | null; // running | done | failed | cancelled
  error: string | null;
}

/** Derived from GET /pulls/:id/reviews (ReviewDto) — one review run's outcome. */
export interface ReviewLite {
  run_id: string | null;
  verdict: string | null;
  score: number | null;
  findings: FindingLite[];
}

/** Subset of ReviewDtoFinding / Finding used by get_findings / run_review. */
export interface FindingLite {
  severity: string; // CRITICAL | WARNING | SUGGESTION
  title: string;
  file: string;
  start_line: number;
  end_line: number;
  category: string; // bug | security | perf | style | test
  confidence: number;
}

/** GET /repos/:id/conventions — subset of ConventionCandidate. */
export interface ConventionLite {
  rule: string;
  category: string | null;
  accepted: boolean;
}
