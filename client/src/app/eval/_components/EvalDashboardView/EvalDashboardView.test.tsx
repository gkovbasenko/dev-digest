import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { EvalDashboard, EvalRunRecord } from "@devdigest/shared";

const { mockDashboard, mockRuns, mockAgent, mockReplace, mockSearchParams } = vi.hoisted(() => ({
  mockDashboard: { current: { data: undefined as EvalDashboard | undefined, isLoading: false, isError: false, refetch: vi.fn() } },
  mockRuns: { current: { data: undefined as EvalRunRecord[] | undefined } },
  mockAgent: { current: { data: undefined as { name: string } | undefined } },
  mockReplace: vi.fn(),
  mockSearchParams: { current: new URLSearchParams("") },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => mockSearchParams.current,
}));

vi.mock("@/lib/hooks/eval", () => ({
  useEvalDashboard: () => mockDashboard.current,
  useAgentEvalRuns: () => mockRuns.current,
}));

vi.mock("@/lib/hooks/agents", () => ({
  useAgent: () => mockAgent.current,
}));

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { EvalDashboardView } from "./EvalDashboardView";

afterEach(() => {
  cleanup();
  mockReplace.mockReset();
  mockSearchParams.current = new URLSearchParams("");
  mockDashboard.current = { data: undefined, isLoading: false, isError: false, refetch: vi.fn() };
  mockRuns.current = { data: undefined };
  mockAgent.current = { data: undefined };
});

const AGENT_CARD_1 = {
  agent_id: "ag-1",
  agent_name: "Security Reviewer",
  recall: 0.8,
  precision: 0.75,
  citation_accuracy: 0.9,
  sparkline: [0.6, 0.8],
  last_run_version: 3,
  last_run_at: "2026-07-01T00:00:00.000Z",
  traces_passed: 17,
  traces_total: 20,
};
const AGENT_CARD_2 = { ...AGENT_CARD_1, agent_id: "ag-2", agent_name: "Perf Agent" };

const RUN: EvalRunRecord = {
  id: "run-1",
  owner_id: "ag-1",
  owner_kind: "agent",
  owner_version: 3,
  ran_at: "2026-07-01T00:00:00.000Z",
  recall: 0.8,
  precision: 0.75,
  citation_accuracy: 0.9,
  traces_passed: 17,
  traces_total: 20,
  case_results: [],
  duration_ms: 3000,
  cost_usd: 0.01,
};

function dashboardFixture(overrides: Partial<EvalDashboard> = {}): EvalDashboard {
  return {
    owner_kind: null,
    owner_id: null,
    cases_total: 8,
    current: { recall: null, precision: null, citation_accuracy: null, traces_passed: 0, traces_total: 0, cost_usd: null },
    delta: { recall: null, precision: null, citation_accuracy: null },
    trend: [],
    recent_runs: [RUN],
    agents: [AGENT_CARD_1, AGENT_CARD_2],
    alert: null,
    ...overrides,
  };
}

describe("EvalDashboardView (AC-15/AC-19/AC-22)", () => {
  it("renders no alert banner when dashboard.alert is null", () => {
    mockDashboard.current = { data: dashboardFixture(), isLoading: false, isError: false, refetch: vi.fn() };

    render(<EvalDashboardView />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders the alert banner when the latest precision dropped (AC-19)", () => {
    mockDashboard.current = {
      data: dashboardFixture({ alert: "Security Reviewer's precision dropped 5pts since the last run" }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };

    render(<EvalDashboardView />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Security Reviewer's precision dropped 5pts since the last run",
    );
  });

  it("renders two agent cards and the ALL-AGENTS recent-runs table when no agent is selected", () => {
    mockDashboard.current = { data: dashboardFixture(), isLoading: false, isError: false, refetch: vi.fn() };

    render(<EvalDashboardView />);

    // "Security Reviewer" appears twice: once as an agent card, once as the
    // owning agent's name resolved into the recent-runs row.
    expect(screen.getAllByText("Security Reviewer")).toHaveLength(2);
    expect(screen.getByText("Perf Agent")).toBeInTheDocument();
    expect(screen.getByText("Recent eval runs · all agents")).toBeInTheDocument();
    expect(screen.getAllByText("80%").length).toBeGreaterThan(0); // recall column of the one run row
  });

  it("shows the recent-runs empty state (not a zeroed chart) when there are no runs yet", () => {
    mockDashboard.current = {
      data: dashboardFixture({ recent_runs: [] }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };

    render(<EvalDashboardView />);

    expect(screen.getByText("No eval runs yet")).toBeInTheDocument();
  });

  it("navigates to the agent-detail view when a card is clicked", () => {
    mockDashboard.current = { data: dashboardFixture(), isLoading: false, isError: false, refetch: vi.fn() };

    render(<EvalDashboardView />);
    fireEvent.click(screen.getByRole("button", { name: /Security Reviewer/ }));

    expect(mockReplace).toHaveBeenCalledWith("/eval?agentId=ag-1");
  });

  it("renders the agent-detail view when ?agentId= is present", () => {
    mockSearchParams.current = new URLSearchParams("agentId=ag-1");
    mockAgent.current = { data: { name: "Security Reviewer" } };
    mockDashboard.current = {
      data: dashboardFixture({
        owner_kind: "agent",
        owner_id: "ag-1",
        current: { recall: 0.8, precision: 0.75, citation_accuracy: 0.9, traces_passed: 17, traces_total: 20, cost_usd: 0.01 },
      }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
    mockRuns.current = { data: [RUN] };

    render(<EvalDashboardView />);

    expect(screen.getByRole("heading", { name: "Security Reviewer" })).toBeInTheDocument();
    expect(screen.getByText("Back to dashboard")).toBeInTheDocument();
  });

  it("shows an error state with a retry action when the dashboard fails to load", () => {
    const refetch = vi.fn();
    mockDashboard.current = { data: undefined, isLoading: false, isError: true, refetch };

    render(<EvalDashboardView />);
    fireEvent.click(screen.getByRole("button", { name: /Retry/ }));

    expect(refetch).toHaveBeenCalledOnce();
  });
});
