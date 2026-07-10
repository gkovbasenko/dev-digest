import type { EvalRunRecord, EvalCompare } from "@devdigest/shared";

/** Computed client-side from two already-loaded `EvalRunRecord`s — there is
    no `/eval/compare` endpoint (T3 by design) and no re-run happens here
    (AC-18). Shape matches the `EvalCompare` contract exactly. */
export function computeCompare(a: EvalRunRecord, b: EvalRunRecord): EvalCompare {
  return {
    a,
    b,
    delta: {
      recall: a.recall != null && b.recall != null ? b.recall - a.recall : null,
      precision: a.precision != null && b.precision != null ? b.precision - a.precision : null,
      citation_accuracy:
        a.citation_accuracy != null && b.citation_accuracy != null
          ? b.citation_accuracy - a.citation_accuracy
          : null,
      pass_count: b.traces_passed - a.traces_passed,
    },
  };
}
