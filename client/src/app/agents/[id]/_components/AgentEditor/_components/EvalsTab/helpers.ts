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

/** Latest `case_result` for ONE case across ALL runs (newest-first). A single-
    case run (`POST /eval-cases/:id/run`) persists its own `eval_runs` row holding
    only that case, so a case's most recent result frequently lives in an OLDER
    run than the global latest — scanning only `latestRunOf` wrongly flips every
    other case back to "never run" the moment any single case is re-run. */
export function latestResultOf(
  caseId: string,
  runs: EvalRunRecord[] | undefined,
): EvalCaseResult | undefined {
  if (!runs || runs.length === 0) return undefined;
  const newestFirst = [...runs].sort((a, b) => new Date(b.ran_at).getTime() - new Date(a.ran_at).getTime());
  for (const run of newestFirst) {
    const result = run.case_results.find((cr) => cr.case_id === caseId);
    if (result) return result;
  }
  return undefined;
}

/** pass/fail from the case's most recent result in ANY run, or "never_run" when
    the case has never appeared in a run. */
export function deriveCaseStatus(caseId: string, runs: EvalRunRecord[] | undefined): EvalCaseStatus {
  const result = latestResultOf(caseId, runs);
  if (!result) return "never_run";
  return result.pass ? "pass" : "fail";
}

/** "expected N finding(s), got M", or "never run". */
export function caseResultText(caseId: string, runs: EvalRunRecord[] | undefined): string {
  const result = latestResultOf(caseId, runs);
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
