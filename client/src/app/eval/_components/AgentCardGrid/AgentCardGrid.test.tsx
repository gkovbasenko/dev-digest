import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { EvalAgentCard } from "./helpers";
import { AgentCardGrid } from "./AgentCardGrid";

afterEach(cleanup);

const SECURITY: EvalAgentCard = {
  agent_id: "ag-1",
  agent_name: "Security Reviewer",
  recall: 0.8,
  precision: 0.75,
  citation_accuracy: 0.9,
  sparkline: [0.6, 0.7, 0.8],
  last_run_version: 3,
  last_run_at: "2026-07-01T12:00:00.000Z",
  traces_passed: 17,
  traces_total: 20,
};

const NEVER_RUN: EvalAgentCard = {
  agent_id: "ag-2",
  agent_name: "Perf Agent",
  recall: null,
  precision: null,
  citation_accuracy: null,
  sparkline: [],
  last_run_version: null,
  last_run_at: null,
  traces_passed: null,
  traces_total: null,
};

describe("AgentCardGrid (AC-15)", () => {
  it("renders one card per agent with its RECALL/PRECISION/CITATION metrics and last-run summary", () => {
    render(<AgentCardGrid agents={[SECURITY, NEVER_RUN]} onSelect={vi.fn()} />);

    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
    expect(screen.getByText("Perf Agent")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("90%")).toBeInTheDocument();
    expect(screen.getByText(/Last run v3 ·/)).toBeInTheDocument();
    expect(screen.getByText(/17\/20 pass/)).toBeInTheDocument();

    // Never-run agent falls back to an explicit empty state, not zeroed metrics.
    expect(screen.getByText("No runs yet")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(3);
  });

  it("calls onSelect with the agent id when a card is clicked", () => {
    const onSelect = vi.fn();
    render(<AgentCardGrid agents={[SECURITY]} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("button", { name: /Security Reviewer/ }));

    expect(onSelect).toHaveBeenCalledWith("ag-1");
  });
});
