import type { Finding } from '@devdigest/shared';
import type { EvalCaseResult } from '@devdigest/shared';
import type { ExpectedOutput } from './helpers.js';

/**
 * Pure scoring — no LLM, no I/O (AC-9). The matching predicate is IDENTICAL in
 * spirit to reviewer-core's citation-grounding gate: same `file` AND inclusive
 * `[start_line, end_line]` ranges intersect.
 */

interface FileRange {
  file: string;
  start_line: number;
  end_line: number;
}

function regionsIntersect(a: FileRange, b: FileRange): boolean {
  if (a.file !== b.file) return false;
  const aLo = Math.min(a.start_line, a.end_line);
  const aHi = Math.max(a.start_line, a.end_line);
  const bLo = Math.min(b.start_line, b.end_line);
  const bHi = Math.max(b.start_line, b.end_line);
  return aLo <= bHi && bLo <= aHi;
}

export interface ScoreCaseInput {
  caseId: string;
  name: string;
  expected: ExpectedOutput;
  /** Kept findings after grounding (`ReviewOutcome.review.findings`). Always `[]` when `failed`. */
  actual: Finding[];
  /** True when the case never got a real attempt (malformed frozen diff / LLM
   *  error) — forces `pass: false` regardless of an otherwise-trivially-satisfied
   *  expectation (e.g. an empty must_find/must_not_flag set). */
  failed: boolean;
  /** Reason recorded in `actual` when `failed` (for the "never go silent" trace). */
  failureReason?: string;
  costUsd: number | null;
  durationMs: number;
}

/** A scored case: the persisted `EvalCaseResult` plus the raw counts a run-level
 *  aggregate needs (which `EvalCaseResult` alone can't losslessly reconstruct). */
export interface CaseScore {
  result: EvalCaseResult;
  mustFindCount: number;
  matchedMustFind: number;
  truePositive: number;
  falsePositive: number;
}

/**
 * Score one case (AC-9..AC-14). `matched_must_find` / `violated` count DISTINCT
 * expected regions that have >=1 matching actual finding (not raw match pairs).
 * `pass` = every must_find region matched AND no must_not_flag region violated
 * AND the case wasn't `failed` closed.
 */
export function scoreCase(input: ScoreCaseInput): CaseScore {
  const { expected, actual } = input;
  const mustFindCount = expected.must_find.length;

  const matchedMustFind = expected.must_find.filter((r) =>
    actual.some((f) => regionsIntersect(r, f)),
  ).length;
  const violated = expected.must_not_flag.filter((r) =>
    actual.some((f) => regionsIntersect(r, f)),
  ).length;

  // Precision inputs: an actual finding is a "true positive" iff it matches
  // >=1 must_find region; every other actual finding (including one that only
  // matches a must_not_flag region, or matches nothing expected at all) is a
  // false positive.
  const truePositive = actual.filter((f) =>
    expected.must_find.some((r) => regionsIntersect(r, f)),
  ).length;
  const falsePositive = actual.length - truePositive;

  const recall = mustFindCount > 0 ? matchedMustFind / mustFindCount : null;
  const precision =
    truePositive + falsePositive > 0 ? truePositive / (truePositive + falsePositive) : null;
  const pass = !input.failed && matchedMustFind === mustFindCount && violated === 0;

  return {
    result: {
      case_id: input.caseId,
      name: input.name,
      pass,
      expected: mustFindCount,
      got: actual.length,
      recall,
      precision,
      cost_usd: input.costUsd,
      duration_ms: input.durationMs,
      actual: input.failed ? { error: input.failureReason ?? 'case failed' } : actual,
    },
    mustFindCount,
    matchedMustFind,
    truePositive,
    falsePositive,
  };
}

export interface CitationTotals {
  /** Sum of `ReviewOutcome.review.findings.length` across every scored case. */
  kept: number;
  /** Sum of `ReviewOutcome.dropped.length` across every scored case. */
  dropped: number;
}

export interface RunAggregate {
  recall: number | null;
  precision: number | null;
  citation_accuracy: number | null;
  traces_passed: number;
  traces_total: number;
}

/**
 * Aggregate a whole run from its per-case scores (AC-8/AC-9, D4):
 *  - recall = Σmatched_must_find / Σmust_find over cases with >=1 must_find,
 *    else `null` (D4 — a set with no must_find case can't score recall).
 *  - precision = TP / (TP+FP) summed across ALL cases, `null` if TP+FP === 0.
 *  - citation_accuracy = Σkept / Σ(kept+dropped) across all cases (AC-10); a
 *    case that never attempted grounding contributes 0/0 (no-op on the sum);
 *    `null` only if the WHOLE run never attempted grounding.
 */
export function aggregateRun(scores: CaseScore[], citation: CitationTotals): RunAggregate {
  const recallCases = scores.filter((s) => s.mustFindCount > 0);
  const recall =
    recallCases.length > 0
      ? recallCases.reduce((sum, s) => sum + s.matchedMustFind, 0) /
        recallCases.reduce((sum, s) => sum + s.mustFindCount, 0)
      : null;

  const tp = scores.reduce((sum, s) => sum + s.truePositive, 0);
  const fp = scores.reduce((sum, s) => sum + s.falsePositive, 0);
  const precision = tp + fp > 0 ? tp / (tp + fp) : null;

  const citationDenom = citation.kept + citation.dropped;
  const citation_accuracy = citationDenom > 0 ? citation.kept / citationDenom : null;

  return {
    recall,
    precision,
    citation_accuracy,
    traces_passed: scores.filter((s) => s.result.pass).length,
    traces_total: scores.length,
  };
}
