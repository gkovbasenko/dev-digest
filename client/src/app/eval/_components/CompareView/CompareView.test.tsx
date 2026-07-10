import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { EvalRunRecord } from "@devdigest/shared";
import { CompareView } from "./CompareView";

afterEach(cleanup);

const RUN_A: EvalRunRecord = {
  id: "run-a",
  owner_id: "ag-1",
  owner_kind: "agent",
  owner_version: 2,
  ran_at: "2026-06-01T10:00:00.000Z",
  recall: 0.7,
  precision: 0.6,
  citation_accuracy: 0.8,
  traces_passed: 14,
  traces_total: 20,
  case_results: [],
  duration_ms: 3000,
  cost_usd: 0.01,
};

const RUN_B: EvalRunRecord = {
  ...RUN_A,
  id: "run-b",
  owner_version: 3,
  ran_at: "2026-07-01T10:00:00.000Z",
  recall: 0.85,
  precision: 0.55,
  citation_accuracy: 0.88,
  traces_passed: 17,
  cost_usd: 0.012,
};

const fetchMock = vi.fn().mockRejectedValue(new Error("network calls are not expected in CompareView"));

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  fetchMock.mockClear();
  vi.unstubAllGlobals();
});

describe("CompareView (AC-18)", () => {
  it("renders both runs side by side with a per-metric delta computed from the two persisted rows, no network call", () => {
    render(<CompareView a={RUN_A} b={RUN_B} agentName="Security Reviewer" onClose={vi.fn()} />);

    expect(screen.getByText("Compare runs · Security Reviewer")).toBeInTheDocument();
    expect(screen.getByText(/v2 ·/)).toBeInTheDocument();
    expect(screen.getByText(/v3 ·/)).toBeInTheDocument();

    // Run A / Run B raw values.
    expect(screen.getByText("70%")).toBeInTheDocument();
    expect(screen.getByText("85%")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(screen.getByText("55%")).toBeInTheDocument();

    // Deltas: recall +0.15, precision -0.05, citation +0.08, pass +3.
    expect(screen.getByText("+0.15")).toBeInTheDocument();
    expect(screen.getByText("-0.05")).toBeInTheDocument();
    expect(screen.getByText("+0.08")).toBeInTheDocument();
    expect(screen.getByText("+3")).toBeInTheDocument();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls onClose when the back control is clicked", () => {
    const onClose = vi.fn();
    render(<CompareView a={RUN_A} b={RUN_B} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: /Back to recent runs/ }));

    expect(onClose).toHaveBeenCalledOnce();
  });
});
