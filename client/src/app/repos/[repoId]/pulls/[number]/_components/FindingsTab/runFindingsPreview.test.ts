import { describe, it, expect } from "vitest";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import { buildRunPreviewMap } from "./runFindingsPreview";

function f(
  id: string,
  severity: FindingRecord["severity"],
  file: string,
  line: number,
  opts: Partial<FindingRecord> = {},
): FindingRecord {
  return {
    id,
    severity,
    category: "security",
    title: `Finding ${id}`,
    file,
    start_line: line,
    end_line: line,
    rationale: `Rationale for ${id}`,
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...opts,
  };
}

function review(runId: string | null, findings: FindingRecord[]): ReviewRecord {
  return {
    id: "r1",
    pr_id: "p1",
    agent_id: "a1",
    run_id: runId,
    agent_name: "Reviewer",
    kind: "review",
    verdict: "request_changes",
    summary: null,
    score: 50,
    model: "x",
    grounding: null,
    created_at: "2026-06-30T00:00:00Z",
    findings,
  };
}

describe("buildRunPreviewMap", () => {
  it("buckets by severity and orders CRIT → WARN → SUGG then file/line", () => {
    const r = review("run1", [
      f("s1", "SUGGESTION", "b.ts", 1),
      f("w1", "WARNING", "a.ts", 30),
      f("c2", "CRITICAL", "b.ts", 5),
      f("c1", "CRITICAL", "a.ts", 11),
    ]);
    const map = buildRunPreviewMap([r]);
    const preview = map.get("run1")!;
    expect(preview.counts).toEqual({ CRITICAL: 2, WARNING: 1, SUGGESTION: 1 });
    expect(preview.top.map((p) => p.id)).toEqual(["c1", "c2", "w1", "s1"]);
  });

  it("excludes dismissed findings", () => {
    const r = review("run1", [
      f("c1", "CRITICAL", "a.ts", 1, { dismissed_at: "2026-06-30T00:00:00Z" }),
      f("c2", "CRITICAL", "a.ts", 2),
    ]);
    const preview = buildRunPreviewMap([r]).get("run1")!;
    expect(preview.counts.CRITICAL).toBe(1);
    expect(preview.top.map((p) => p.id)).toEqual(["c2"]);
  });

  it("caps top to 5 findings even with more open", () => {
    const r = review(
      "run1",
      Array.from({ length: 8 }, (_, i) => f(`c${i}`, "CRITICAL", "a.ts", i + 1)),
    );
    const preview = buildRunPreviewMap([r]).get("run1")!;
    expect(preview.counts.CRITICAL).toBe(8);
    expect(preview.top).toHaveLength(5);
  });

  it("truncates rationale beyond 200 chars with an ellipsis", () => {
    const longText = "x".repeat(250);
    const r = review("run1", [f("c1", "CRITICAL", "a.ts", 1, { rationale: longText })]);
    const preview = buildRunPreviewMap([r]).get("run1")!;
    expect(preview.top[0]!.rationale_excerpt.endsWith("…")).toBe(true);
    expect(preview.top[0]!.rationale_excerpt.length).toBeLessThanOrEqual(201);
  });

  it("skips reviews with no run_id", () => {
    const r = review(null, [f("c1", "CRITICAL", "a.ts", 1)]);
    const map = buildRunPreviewMap([r]);
    expect(map.size).toBe(0);
  });
});
