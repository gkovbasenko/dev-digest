import { EMPTY_EXPECTED_OUTPUT, FINDING_SKELETON, type ExpectedOutput } from "./schema";

/** Pretty-print an `EvalCase.expected_output` for the editor's textarea. Falls
    back to the empty shape when the case has none yet (new case, or malformed
    legacy data — never crash the editor over bad JSON already in the DB). */
export function stringifyExpectedOutput(value: unknown): string {
  const base =
    value && typeof value === "object" ? (value as Partial<ExpectedOutput>) : EMPTY_EXPECTED_OUTPUT;
  const normalized: ExpectedOutput = {
    must_find: Array.isArray(base.must_find) ? base.must_find : [],
    must_not_flag: Array.isArray(base.must_not_flag) ? base.must_not_flag : [],
  };
  return JSON.stringify(normalized, null, 2);
}

/** Append a blank must_find skeleton row to the current JSON text, tolerating
    (rather than rejecting) invalid JSON already in the box — the user just
    wants a starting point to fix from. */
export function insertFindingSkeleton(raw: string): string {
  let base: ExpectedOutput;
  try {
    const parsed = JSON.parse(raw);
    base = {
      must_find: Array.isArray(parsed?.must_find) ? parsed.must_find : [],
      must_not_flag: Array.isArray(parsed?.must_not_flag) ? parsed.must_not_flag : [],
    };
  } catch {
    base = { must_find: [], must_not_flag: [] };
  }
  base.must_find = [...base.must_find, { ...FINDING_SKELETON }];
  return JSON.stringify(base, null, 2);
}

/** "expected N finding(s), got M" — the run-on-save result strip label (AC-21). */
export function formatExpectedGot(expected: number, got: number): string {
  return `expected ${expected} finding${expected === 1 ? "" : "s"}, got ${got}`;
}

export function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export function formatCost(costUsd: number | null): string {
  if (costUsd == null) return "—";
  return `$${costUsd.toFixed(4)}`;
}
