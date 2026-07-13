import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { EvalRunRecord } from "@devdigest/shared";
import { RecentRunsTable } from "./RecentRunsTable";

afterEach(cleanup);

const RUN: EvalRunRecord = {
  id: "run-1",
  owner_id: "ag-1",
  owner_kind: "agent",
  owner_version: 3,
  ran_at: "2026-07-01T12:00:00.000Z",
  recall: 0.8,
  precision: 0.75,
  citation_accuracy: 0.9,
  traces_passed: 17,
  traces_total: 20,
  case_results: [],
  duration_ms: 4200,
  cost_usd: 0.021,
};

describe("RecentRunsTable — dashboard 'RECENT EVAL RUNS · ALL AGENTS' (AC-15/AC-22)", () => {
  it("renders one row per run, resolving the owning agent's name", () => {
    render(<RecentRunsTable runs={[RUN]} agentNameById={{ "ag-1": "Security Reviewer" }} />);

    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("90%")).toBeInTheDocument();
    expect(screen.getByText("17/20")).toBeInTheDocument();
    expect(screen.getByText("$0.0210")).toBeInTheDocument();
  });

  it("shows an empty-state prompt (never a zeroed chart) when there are no runs", () => {
    render(<RecentRunsTable runs={[]} agentNameById={{}} />);

    expect(screen.getByText("No eval runs yet")).toBeInTheDocument();
    expect(screen.queryByText("Ran at")).not.toBeInTheDocument();
  });
});
