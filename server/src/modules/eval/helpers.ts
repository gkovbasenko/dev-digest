import { z } from 'zod';
import { Severity, FindingCategory } from '@devdigest/shared';
import type { EvalCase, EvalCaseResult, EvalRunRecord, EvalOwnerKind } from '@devdigest/shared';
import type { EvalCaseRow, EvalRunRow } from './repository.js';

/**
 * Pure helpers for the eval module — the `expected_output` shape (parsed out
 * of the `jsonb` column, never a shared Zod contract since `EvalCase.expected_output`
 * is `z.unknown()` on the wire) and DB row ⇄ DTO mapping. No I/O.
 */

// ---- expected_output shape (must_find / must_not_flag) --------------------

/** A file+line region. Matching predicate (scoring.ts): same file AND inclusive [start,end] intersect. */
export const Region = z.object({
  file: z.string().min(1),
  start_line: z.number().int(),
  end_line: z.number().int(),
});
export type Region = z.infer<typeof Region>;

/** A `must_find` entry additionally carries the display metadata of the expected finding. */
export const MustFindRegion = Region.extend({
  severity: Severity,
  category: FindingCategory,
  title: z.string(),
});
export type MustFindRegion = z.infer<typeof MustFindRegion>;

export const ExpectedOutput = z.object({
  must_find: z.array(MustFindRegion).default([]),
  must_not_flag: z.array(Region).default([]),
});
export type ExpectedOutput = z.infer<typeof ExpectedOutput>;

/** Parse an unvalidated `expected_output` jsonb blob; falls back to an empty
 *  (always-passing) expectation rather than throwing — a case editor error
 *  shouldn't crash a whole-set run over one bad case. */
export function parseExpectedOutput(raw: unknown): ExpectedOutput {
  const parsed = ExpectedOutput.safeParse(raw);
  return parsed.success ? parsed.data : { must_find: [], must_not_flag: [] };
}

/** Build the pre-filled `expected_output` for "Turn into eval case":
 *  accepted → one must_find row (incl. severity/category/title); dismissed →
 *  one must_not_flag region. Caller guarantees `action` matches the finding's
 *  accepted_at/dismissed_at state. */
export function expectedOutputFromFinding(
  action: 'accepted' | 'dismissed',
  finding: { file: string; startLine: number; endLine: number; severity: string; category: string; title: string },
): ExpectedOutput {
  const region: Region = { file: finding.file, start_line: finding.startLine, end_line: finding.endLine };
  if (action === 'accepted') {
    return {
      must_find: [
        {
          ...region,
          severity: finding.severity as z.infer<typeof Severity>,
          category: finding.category as z.infer<typeof FindingCategory>,
          title: finding.title,
        },
      ],
      must_not_flag: [],
    };
  }
  return { must_find: [], must_not_flag: [region] };
}

/**
 * Reconstruct a raw unified-diff text from persisted `pr_files` patches — the
 * same shape reviews/diff-loader.ts's `diffFromPrFiles` builds, reimplemented
 * here (rather than importing that module-internal helper) so the eval
 * repository boundary stays "cross-module reads only via the shared
 * `container.reviewRepo`" (server-architecture: no cross-module internals
 * import). Feed the result to `parseUnifiedDiff` to get a `UnifiedDiff`.
 */
export function rawDiffFromPrFiles(files: { path: string; patch: string | null }[]): string {
  const parts: string[] = [];
  for (const f of files) {
    if (!f.patch) continue;
    parts.push(`diff --git a/${f.path} b/${f.path}`);
    parts.push(`--- a/${f.path}`);
    parts.push(`+++ b/${f.path}`);
    parts.push(f.patch);
  }
  return parts.join('\n');
}

// ---- DB row ⇄ DTO mapping ---------------------------------------------------

/** Map a persisted `eval_cases` row to the public `EvalCase` DTO. */
export function toEvalCaseDto(row: EvalCaseRow): EvalCase {
  return {
    id: row.id,
    owner_kind: row.ownerKind as EvalOwnerKind,
    owner_id: row.ownerId,
    name: row.name,
    input_diff: row.inputDiff ?? '',
    input_files: row.inputFiles,
    input_meta: row.inputMeta,
    expected_output: row.expectedOutput,
    notes: row.notes,
    source_finding_id: row.sourceFindingId,
  };
}

/** Map a persisted `eval_runs` row to the public `EvalRunRecord` DTO. */
export function toEvalRunRecordDto(row: EvalRunRow): EvalRunRecord {
  return {
    id: row.id,
    owner_id: row.ownerId,
    owner_kind: row.ownerKind as EvalOwnerKind,
    owner_version: row.ownerVersion,
    ran_at: row.ranAt.toISOString(),
    recall: row.recall,
    precision: row.precision,
    citation_accuracy: row.citationAccuracy,
    traces_passed: row.tracesPassed,
    traces_total: row.tracesTotal,
    case_results: row.caseResults as EvalCaseResult[],
    duration_ms: row.durationMs ?? 0,
    cost_usd: row.costUsd,
  };
}

/** Null-safe sum: empty input or all-null inputs sum to `null` (spec edge case —
 *  no usage-bearing provider in the whole set → UI shows "—"); otherwise sums
 *  the present values, treating `null` entries as 0. */
export function sumNullable(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v != null);
  if (present.length === 0) return null;
  return present.reduce((a, b) => a + b, 0);
}
