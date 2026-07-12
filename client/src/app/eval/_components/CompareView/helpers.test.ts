import { describe, it, expect } from "vitest";
import type { EvalRunRecord } from "@devdigest/shared";
import { computeCompare } from "./helpers";

/** Minimal EvalRunRecord fixture — only the metric fields matter to computeCompare. */
function run(over: Partial<EvalRunRecord> = {}): EvalRunRecord {
  return {
    id: over.id ?? "r1",
    owner_id: "a1",
    owner_kind: "agent",
    owner_version: 1,
    ran_at: "2026-07-13T00:00:00.000Z",
    recall: 0.5,
    precision: 0.5,
    citation_accuracy: 0.5,
    traces_passed: 1,
    traces_total: 2,
    case_results: [],
    duration_ms: 10,
    cost_usd: null,
    ...over,
  };
}

describe("computeCompare", () => {
  it("computes numeric deltas when both runs have metrics", () => {
    const cmp = computeCompare(
      run({ recall: 0.4, precision: 0.6, citation_accuracy: 0.5, traces_passed: 1 }),
      run({ recall: 0.7, precision: 0.5, citation_accuracy: 0.9, traces_passed: 3 }),
    );
    expect(cmp.delta.recall).toBeCloseTo(0.3);
    expect(cmp.delta.precision).toBeCloseTo(-0.1);
    expect(cmp.delta.citation_accuracy).toBeCloseTo(0.4);
    expect(cmp.delta.pass_count).toBe(2);
  });

  it("yields null deltas when EITHER run's metric is null (the untested null-delta path)", () => {
    const cmp = computeCompare(
      run({ recall: null, precision: 0.6, citation_accuracy: null }),
      run({ recall: 0.7, precision: null, citation_accuracy: 0.9 }),
    );
    expect(cmp.delta.recall).toBeNull();
    expect(cmp.delta.precision).toBeNull();
    expect(cmp.delta.citation_accuracy).toBeNull();
    // pass_count is a plain integer diff — always computed, never null.
    expect(cmp.delta.pass_count).toBe(0);
  });

  it("passes the two runs through unchanged as a/b", () => {
    const a = run({ id: "a" });
    const b = run({ id: "b" });
    const cmp = computeCompare(a, b);
    expect(cmp.a).toBe(a);
    expect(cmp.b).toBe(b);
  });
});
