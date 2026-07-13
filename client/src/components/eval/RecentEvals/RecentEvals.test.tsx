import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { EvalDashboard } from "@devdigest/shared";

const { mockPush, mockDashboardData, mockDashboardLoading } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockDashboardData: { current: undefined as EvalDashboard | undefined },
  mockDashboardLoading: { current: false },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/lib/hooks/eval", () => ({
  useEvalDashboard: () => ({
    data: mockDashboardData.current,
    isLoading: mockDashboardLoading.current,
  }),
}));

import { RecentEvals } from "./RecentEvals";

afterEach(() => {
  cleanup();
  mockPush.mockReset();
  mockDashboardData.current = undefined;
  mockDashboardLoading.current = false;
});

const DASHBOARD: EvalDashboard = {
  owner_kind: null,
  owner_id: null,
  cases_total: 4,
  current: {
    recall: 0.9,
    precision: 0.8,
    citation_accuracy: 0.95,
    traces_passed: 9,
    traces_total: 10,
    cost_usd: 0.12,
  },
  delta: { recall: 0.05, precision: -0.02, citation_accuracy: 0.01 },
  trend: [],
  recent_runs: [],
  agents: [
    {
      agent_id: "agent-1",
      agent_name: "security-agent",
      recall: 0.9,
      precision: 0.8,
      citation_accuracy: 0.95,
      sparkline: [0.7, 0.8, 0.9],
      last_run_version: 3,
      last_run_at: "2026-07-09T12:00:00.000Z",
      traces_passed: 9,
      traces_total: 10,
    },
    {
      agent_id: "agent-2",
      agent_name: "unrelated-agent",
      recall: 0.5,
      precision: 0.5,
      citation_accuracy: 0.5,
      sparkline: [],
      last_run_version: 1,
      last_run_at: "2026-07-01T00:00:00.000Z",
      traces_passed: 1,
      traces_total: 2,
    },
  ],
  alert: null,
};

describe("RecentEvals (AC-22)", () => {
  it("renders an empty-state (never a zeroed chart) when none of this PR's agents have ever run an eval", () => {
    mockDashboardData.current = { ...DASHBOARD, agents: [] };
    render(<RecentEvals agents={[{ id: "agent-1", name: "security-agent" }]} />);

    expect(screen.getByText("No eval runs yet")).toBeInTheDocument();
    expect(screen.queryByText("RECALL")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open Eval Dashboard" }));
    expect(mockPush).toHaveBeenCalledWith("/eval");
  });

  it("renders an empty-state when the dashboard has runs but none belong to this PR's agents", () => {
    mockDashboardData.current = DASHBOARD;
    render(<RecentEvals agents={[{ id: "agent-3", name: "other-agent" }]} />);

    expect(screen.getByText("No eval runs yet")).toBeInTheDocument();
  });

  it("shows the latest run metrics scoped to this PR's agents, and links to /eval", () => {
    mockDashboardData.current = DASHBOARD;
    render(<RecentEvals agents={[{ id: "agent-1", name: "security-agent" }]} />);

    expect(screen.getByText("security-agent")).toBeInTheDocument();
    expect(screen.queryByText("unrelated-agent")).not.toBeInTheDocument();
    expect(screen.getByText("RECALL")).toBeInTheDocument();
    expect(screen.getByText("90%")).toBeInTheDocument();
    expect(screen.getByText(/v3/)).toBeInTheDocument();
    expect(screen.getByText(/9\/10 pass/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open Eval Dashboard →" }));
    expect(mockPush).toHaveBeenCalledWith("/eval");
  });

  it("shows a loading state while the dashboard is fetching", () => {
    mockDashboardLoading.current = true;
    render(<RecentEvals agents={[{ id: "agent-1", name: "security-agent" }]} />);
    expect(screen.getByText("Loading eval metrics…")).toBeInTheDocument();
  });
});
