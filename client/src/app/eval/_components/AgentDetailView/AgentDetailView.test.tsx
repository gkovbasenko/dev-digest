import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { EvalDashboard, EvalRunRecord } from "@devdigest/shared";
import { AgentDetailView } from "./AgentDetailView";

afterEach(cleanup);

const TREND = [
  { ran_at: "2026-06-01T00:00:00.000Z", recall: 0.7, precision: 0.6, citation_accuracy: 0.8, pass_rate: 0.7, cost_usd: 0.01 },
  { ran_at: "2026-07-01T00:00:00.000Z", recall: 0.85, precision: 0.55, citation_accuracy: 0.9, pass_rate: 0.85, cost_usd: 0.012 },
];

const DASHBOARD: EvalDashboard = {
  owner_kind: "agent",
  owner_id: "ag-1",
  cases_total: 5,
  current: { recall: 0.85, precision: 0.55, citation_accuracy: 0.9, traces_passed: 17, traces_total: 20, cost_usd: 0.012 },
  delta: { recall: 0.15, precision: -0.05, citation_accuracy: 0.1 },
  trend: TREND,
  recent_runs: [],
  agents: [],
  alert: null,
};

function makeRun(id: string, version: number, overrides: Partial<EvalRunRecord> = {}): EvalRunRecord {
  return {
    id,
    owner_id: "ag-1",
    owner_kind: "agent",
    owner_version: version,
    ran_at: "2026-07-01T00:00:00.000Z",
    recall: 0.8,
    precision: 0.6,
    citation_accuracy: 0.9,
    traces_passed: 16,
    traces_total: 20,
    case_results: [],
    duration_ms: 3000,
    cost_usd: 0.01,
    ...overrides,
  };
}

const RUNS: EvalRunRecord[] = [makeRun("run-1", 3), makeRun("run-2", 2), makeRun("run-3", 1)];

describe("AgentDetailView (AC-16/AC-17/AC-19)", () => {
  it("renders metric cards with delta, the metric-trend legend, and a recent-runs row per run", () => {
    render(
      <AgentDetailView agentId="ag-1" agentName="Security Reviewer" dashboard={DASHBOARD} runs={RUNS} onBack={vi.fn()} />,
    );

    expect(screen.getByRole("heading", { name: "Security Reviewer" })).toBeInTheDocument();
    expect(screen.getByText("RECALL")).toBeInTheDocument();
    expect(screen.getByText("85%")).toBeInTheDocument();
    expect(screen.getByText("PRECISION")).toBeInTheDocument();
    expect(screen.getByText("CITATION ACCURACY")).toBeInTheDocument();
    expect(screen.getByText("TRACES PASSED")).toBeInTheDocument();
    expect(screen.getByText("17/20")).toBeInTheDocument();
    expect(screen.getByText("Metric trend")).toBeInTheDocument();

    // Three run rows, each version-linked.
    expect(screen.getByRole("link", { name: "v3" })).toHaveAttribute("href", "/agents/ag-1");
    expect(screen.getByRole("link", { name: "v2" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "v1" })).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
  });

  it("no alert banner when dashboard.alert is null (AC-19)", () => {
    render(
      <AgentDetailView agentId="ag-1" agentName="Security Reviewer" dashboard={DASHBOARD} runs={RUNS} onBack={vi.fn()} />,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders the alert banner when the latest precision dropped (AC-19)", () => {
    const withAlert: EvalDashboard = { ...DASHBOARD, alert: "Precision dropped 5pts since the last run" };
    render(
      <AgentDetailView agentId="ag-1" agentName="Security Reviewer" dashboard={withAlert} runs={RUNS} onBack={vi.fn()} />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Precision dropped 5pts since the last run");
  });

  it("enables Compare only when exactly two runs are selected (AC-17)", () => {
    render(
      <AgentDetailView agentId="ag-1" agentName="Security Reviewer" dashboard={DASHBOARD} runs={RUNS} onBack={vi.fn()} />,
    );
    const checkboxes = screen.getAllByRole("checkbox");
    const compareBtn = screen.getByRole("button", { name: /Compare/ });

    expect(compareBtn).toBeDisabled();

    fireEvent.click(checkboxes[0]!);
    expect(compareBtn).toBeDisabled(); // 1 selected

    fireEvent.click(checkboxes[1]!);
    expect(compareBtn).not.toBeDisabled(); // 2 selected

    fireEvent.click(checkboxes[2]!);
    expect(compareBtn).toBeDisabled(); // 3 selected
  });

  it("opens the compare view (side-by-side, no re-run) when Compare is clicked with exactly two selected", () => {
    render(
      <AgentDetailView agentId="ag-1" agentName="Security Reviewer" dashboard={DASHBOARD} runs={RUNS} onBack={vi.fn()} />,
    );
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]!);
    fireEvent.click(checkboxes[1]!);
    fireEvent.click(screen.getByRole("button", { name: /Compare/ }));

    expect(screen.getByText("Compare runs · Security Reviewer")).toBeInTheDocument();
    expect(screen.queryByText("Metric trend")).not.toBeInTheDocument();
  });
});
