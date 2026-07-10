/* helpers.ts — pure derivations for EvalsTab (T6, AC-5/AC-6). No React, no
   fetch: latest-run selection, per-case status/result text, and a best-effort
   read of the must_find badge from a case's (unknown-shaped) expected_output. */
import type { EvalCase, EvalCaseResult, EvalRunRecord } from "@devdigest/shared";
import type { Category, Severity } from "@devdigest/ui";
import type { EvalCaseStatus } from "@/components/eval";

const KNOWN_SEVERITIES: readonly string[] = ["CRITICAL", "WARNING", "SUGGESTION", "INFO"];
const KNOWN_CATEGORIES: readonly string[] = ["bug", "security", "perf", "style", "test"];

export interface CaseBadge {
  severity: Severity;
  category: Category;
}

/** Most recent run by `ran_at` (server already returns them ordered, but this
    tab doesn't depend on that — sorts defensively). */
export function latestRunOf(runs: EvalRunRecord[] | undefined): EvalRunRecord | undefined {
  if (!runs || runs.length === 0) return undefined;
  return [...runs].sort((a, b) => new Date(b.ran_at).getTime() - new Date(a.ran_at).getTime())[0];
}

function findCaseResult(caseId: string, latestRun: EvalRunRecord | undefined): EvalCaseResult | undefined {
  return latestRun?.case_results.find((cr) => cr.case_id === caseId);
}

/** pass/fail from the latest run's case_results, or "never_run" when the case
    has no entry there (new case since the last run, or no run yet at all). */
export function deriveCaseStatus(caseId: string, latestRun: EvalRunRecord | undefined): EvalCaseStatus {
  const result = findCaseResult(caseId, latestRun);
  if (!result) return "never_run";
  return result.pass ? "pass" : "fail";
}

/** "expected N finding(s), got M", or "never run". */
export function caseResultText(caseId: string, latestRun: EvalRunRecord | undefined): string {
  const result = findCaseResult(caseId, latestRun);
  if (!result) return "never run";
  return `expected ${result.expected} finding${result.expected === 1 ? "" : "s"}, got ${result.got}`;
}

/** Best-effort read of the first must_find region's severity/category for the
    row badge. `EvalCase.expected_output` is `z.unknown()` in the contract, so
    this tolerates any shape and returns null (rendered as "[]") for a
    must_not_flag-only/clean case or malformed data — never throws. */
export function deriveCaseBadge(expectedOutput: EvalCase["expected_output"]): CaseBadge | null {
  if (!expectedOutput || typeof expectedOutput !== "object") return null;
  const mustFind = (expectedOutput as { must_find?: unknown }).must_find;
  if (!Array.isArray(mustFind) || mustFind.length === 0) return null;
  const first = mustFind[0];
  if (!first || typeof first !== "object") return null;
  const { severity, category } = first as { severity?: unknown; category?: unknown };
  if (typeof severity !== "string" || !KNOWN_SEVERITIES.includes(severity)) return null;
  if (typeof category !== "string" || !KNOWN_CATEGORIES.includes(category)) return null;
  return { severity: severity as Severity, category: category as Category };
}
