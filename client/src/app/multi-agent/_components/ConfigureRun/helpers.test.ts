import { describe, it, expect } from "vitest";
import {
  estimateMultiAgentRun,
  formatAgentRowStats,
  formatEstimateCostUsd,
  formatEstimateSeconds,
  type SelectedAgentEstimateInput,
} from "./helpers";

function agent(
  agentId: string,
  avgLatencyMs: number | null,
  avgCostUsd: number | null,
  isLoading = false,
): SelectedAgentEstimateInput {
  return {
    agentId,
    stats: avgLatencyMs == null && avgCostUsd == null ? null : { avg_latency_ms: avgLatencyMs, avg_cost_usd: avgCostUsd },
    isLoading,
  };
}

describe("estimateMultiAgentRun", () => {
  it("AC-9/10: {A:4s/$0.05, B:8.2s/$0.06, C:no-data} -> max latency, summed cost, and an excludes-1 marker", () => {
    const result = estimateMultiAgentRun([
      agent("A", 4000, 0.05),
      agent("B", 8200, 0.06),
      agent("C", null, null),
    ]);

    expect(result.maxLatencyMs).toBe(8200);
    expect(result.totalCostUsd).toBeCloseTo(0.11, 5);
    expect(result.label).toBe("≈ 8.2s · $0.11 · parallel fan-out");
    expect(result.excludedCount).toBe(1);
    expect(result.incompleteMarker).toContain("excludes 1 agent");
  });

  it("returns the empty estimate when nothing is selected", () => {
    const result = estimateMultiAgentRun([]);
    expect(result).toEqual({
      totalCostUsd: null,
      maxLatencyMs: null,
      excludedCount: 0,
      label: "",
      incompleteMarker: null,
    });
  });

  it("carries no incompleteness marker when every selected agent has history", () => {
    const result = estimateMultiAgentRun([agent("A", 4000, 0.05), agent("B", 8200, 0.06)]);
    expect(result.incompleteMarker).toBeNull();
    expect(result.label).toBe("≈ 8.2s · $0.11 · parallel fan-out");
  });

  it("produces no label and a full-count marker when every selected agent has no history", () => {
    const result = estimateMultiAgentRun([agent("A", null, null), agent("B", null, null)]);
    expect(result.label).toBe("");
    expect(result.totalCostUsd).toBeNull();
    expect(result.maxLatencyMs).toBeNull();
    expect(result.incompleteMarker).toContain("excludes 2 agents");
  });

  it("is null-safe for cost when a with-history agent has no priced model (avg_cost_usd null, avg_latency_ms present)", () => {
    const result = estimateMultiAgentRun([agent("A", 4000, null), agent("B", 8200, 0.06)]);
    expect(result.maxLatencyMs).toBe(8200);
    expect(result.totalCostUsd).toBeCloseTo(0.06, 5);
    expect(result.excludedCount).toBe(0);
    expect(result.incompleteMarker).toBeNull();
    expect(result.label).toBe("≈ 8.2s · $0.06 · parallel fan-out");
  });

  it("a single selected agent with history still reports parallel fan-out", () => {
    const result = estimateMultiAgentRun([agent("A", 4000, 0.05)]);
    expect(result.label).toBe("≈ 4s · $0.05 · parallel fan-out");
  });

  it("a still-loading agent is skipped entirely — not summed, not counted as no-history", () => {
    const result = estimateMultiAgentRun([agent("A", 4000, 0.05), agent("B", null, null, true)]);
    expect(result.maxLatencyMs).toBe(4000);
    expect(result.totalCostUsd).toBeCloseTo(0.05, 5);
    expect(result.excludedCount).toBe(0);
    expect(result.incompleteMarker).toBeNull();
    expect(result.label).toBe("≈ 4s · $0.05 · parallel fan-out");
  });

  it("produces no label and no false incompleteness marker when every selected agent is still loading", () => {
    const result = estimateMultiAgentRun([agent("A", null, null, true), agent("B", null, null, true)]);
    expect(result.label).toBe("");
    expect(result.totalCostUsd).toBeNull();
    expect(result.maxLatencyMs).toBeNull();
    expect(result.excludedCount).toBe(0);
    expect(result.incompleteMarker).toBeNull();
  });
});

describe("formatEstimateSeconds", () => {
  it("rounds to one decimal and drops a trailing .0", () => {
    expect(formatEstimateSeconds(4000)).toBe("4s");
    expect(formatEstimateSeconds(8200)).toBe("8.2s");
    expect(formatEstimateSeconds(8250)).toBe("8.3s");
  });
});

describe("formatEstimateCostUsd", () => {
  it("formats to two decimal places with a leading $", () => {
    expect(formatEstimateCostUsd(0.05)).toBe("$0.05");
    expect(formatEstimateCostUsd(0.11)).toBe("$0.11");
    expect(formatEstimateCostUsd(1)).toBe("$1.00");
  });
});

describe("formatAgentRowStats", () => {
  it("AC-7: renders '~{seconds} · {cost}' for an agent with history", () => {
    expect(formatAgentRowStats({ avg_latency_ms: 6000, avg_cost_usd: 0.05 }, false)).toBe("~6s · $0.05");
  });

  it("AC-8: renders '— · no data' (no $, no seconds number) when the query has resolved with no history", () => {
    const result = formatAgentRowStats({ avg_latency_ms: null, avg_cost_usd: null }, false);
    expect(result).toBe("— · no data");
    expect(result).not.toContain("$");
    expect(result).not.toMatch(/\ds/);
  });

  it("treats a resolved-but-empty stats snapshot (null/undefined, isLoading false) the same — no fabricated number", () => {
    expect(formatAgentRowStats(undefined, false)).toBe("— · no data");
    expect(formatAgentRowStats(null, false)).toBe("— · no data");
  });

  it("is null-safe for cost when latency history exists but the model is unpriced", () => {
    expect(formatAgentRowStats({ avg_latency_ms: 6000, avg_cost_usd: null }, false)).toBe("~6s · —");
  });

  it("renders a loading indicator (never 'no data') while the query is still in flight, regardless of stats", () => {
    expect(formatAgentRowStats(undefined, true)).toBe("…");
    expect(formatAgentRowStats(null, true)).toBe("…");
    expect(formatAgentRowStats({ avg_latency_ms: 6000, avg_cost_usd: 0.05 }, true)).toBe("…");
  });
});
