import type { EvalRunRecord, EvalCompare } from "@devdigest/shared";

export type DiffLine = { type: "same" | "add" | "del"; text: string };

/** Minimal line-level diff (LCS backtrace) between two prompt snapshots, for the
    unified System Prompt Diff panel. Pure & deterministic — unit-tested in
    helpers.test.ts. `del` = present in the old version only, `add` = new only. */
export function diffLines(oldText: string, newText: string): DiffLine[] {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  const n = a.length;
  const m = b.length;
  // lcs[i][j] = length of the longest common subsequence of a[i..] and b[j..].
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: "same", text: a[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push({ type: "del", text: a[i]! });
      i++;
    } else {
      out.push({ type: "add", text: b[j]! });
      j++;
    }
  }
  while (i < n) out.push({ type: "del", text: a[i++]! });
  while (j < m) out.push({ type: "add", text: b[j++]! });
  return out;
}

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
