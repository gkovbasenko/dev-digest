import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../messages/en/runs.json";

const {
  mockPulls,
  mockAgents,
  mockResult,
  mockStatsQueries,
  mockTriggerRun,
  mockReplace,
  mockSearchParams,
} = vi.hoisted(() => ({
  mockPulls: { current: { data: [] as { id: string; number: number; title: string }[] } },
  mockAgents: { current: { data: [] as Agent[] } },
  mockResult: { current: { data: undefined as unknown, isLoading: false } },
  mockStatsQueries: {
    current: [] as { data: { avg_latency_ms: number | null; avg_cost_usd: number | null } | undefined; isLoading: boolean }[],
  },
  mockTriggerRun: { current: { mutate: vi.fn(), isPending: false } },
  mockReplace: vi.fn(),
  mockSearchParams: { current: new URLSearchParams("") },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => mockSearchParams.current,
}));

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: "repo-1" }),
}));

vi.mock("@/lib/hooks/core", () => ({
  usePulls: () => mockPulls.current,
}));

vi.mock("@/lib/hooks/agents", () => ({
  useAgents: () => mockAgents.current,
}));

vi.mock("@/lib/hooks/multi-agent", () => ({
  useMultiAgentRun: () => mockTriggerRun.current,
  useMultiAgentResult: () => mockResult.current,
  useAgentsStats: () => mockStatsQueries.current,
}));

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { ConfigureRun } from "./ConfigureRun";

function renderConfigureRun() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <ConfigureRun />
    </NextIntlClientProvider>,
  );
}

function agentFixture(overrides: Partial<Agent> = {}): Agent {
  return {
    id: "agent-1",
    name: "Security Reviewer",
    description: "",
    provider: "openai",
    model: "gpt-4.1",
    system_prompt: "",
    output_schema: null,
    enabled: true,
    version: 1,
    strategy: "single-pass",
    ci_fail_on: "critical",
    repo_intel: true,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  mockReplace.mockReset();
  mockTriggerRun.current.mutate.mockReset();
  mockSearchParams.current = new URLSearchParams("");
  mockPulls.current = { data: [] };
  mockAgents.current = { data: [] };
  mockResult.current = { data: undefined, isLoading: false };
  mockStatsQueries.current = [];
  mockTriggerRun.current = { mutate: vi.fn(), isPending: false };
});

describe("ConfigureRun (AC-5/6/7/8/9/10)", () => {
  it("AC-6: with no PR selected, shows the empty state and keeps the run action non-actionable", () => {
    mockAgents.current = { data: [agentFixture()] };
    mockStatsQueries.current = [{ data: undefined, isLoading: false }];

    renderConfigureRun();

    expect(screen.getByText("Pick a pull request first")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Run multi-agent review/ })).toBeDisabled();

    // Checklist is inert: clicking the checkbox doesn't select anything and
    // the run button stays disabled.
    fireEvent.click(screen.getByRole("checkbox", { name: "Security Reviewer" }));
    expect(screen.getByRole("button", { name: /Run multi-agent review/ })).toBeDisabled();
  });

  it("AC-7/8/9/10: renders per-agent stats rows and a pre-run estimate once agents are selected", () => {
    mockSearchParams.current = new URLSearchParams("pr=42");
    mockPulls.current = { data: [{ id: "pr-uuid-1", number: 42, title: "Add rate limiting" }] };
    mockAgents.current = {
      data: [agentFixture({ id: "agent-1", name: "Security Reviewer" }), agentFixture({ id: "agent-2", name: "Perf Reviewer" })],
    };
    mockStatsQueries.current = [
      { data: { avg_latency_ms: 6000, avg_cost_usd: 0.05 }, isLoading: false }, // AC-7
      { data: { avg_latency_ms: null, avg_cost_usd: null }, isLoading: false }, // AC-8
    ];

    renderConfigureRun();

    // AC-7: agent with history renders "~6s · $0.05".
    expect(screen.getByText("~6s · $0.05")).toBeInTheDocument();
    // AC-8: agent with no history renders "— · no data" — never a fabricated number.
    expect(screen.getByText("— · no data")).toBeInTheDocument();

    // Select both agents to trigger the pre-run estimate.
    fireEvent.click(screen.getByRole("checkbox", { name: "Security Reviewer" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Perf Reviewer" }));

    // AC-9: summary estimate uses the one agent with history.
    expect(screen.getByText("≈ 6s · $0.05 · parallel fan-out")).toBeInTheDocument();
    // AC-10: an explicit incompleteness marker for the no-data agent.
    expect(screen.getByText(/excludes 1 agent with no history/)).toBeInTheDocument();

    // Run action is now actionable (a PR + at least one agent selected).
    expect(screen.getByRole("button", { name: /Run multi-agent review \(2\)/ })).toBeEnabled();
  });

  it("AC-9/10 fix: a still-loading agent shows a loading indicator (not '— · no data') and is not counted in the incompleteness marker", () => {
    mockSearchParams.current = new URLSearchParams("pr=42");
    mockPulls.current = { data: [{ id: "pr-uuid-1", number: 42, title: "Add rate limiting" }] };
    mockAgents.current = {
      data: [agentFixture({ id: "agent-1", name: "Security Reviewer" }), agentFixture({ id: "agent-2", name: "Perf Reviewer" })],
    };
    mockStatsQueries.current = [
      { data: { avg_latency_ms: 6000, avg_cost_usd: 0.05 }, isLoading: false },
      { data: undefined, isLoading: true }, // still resolving — must not read as "no history"
    ];

    renderConfigureRun();

    // The still-loading agent shows a loading indicator, never "no data".
    expect(screen.getByText("…")).toBeInTheDocument();
    expect(screen.queryByText("— · no data")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "Security Reviewer" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Perf Reviewer" }));

    // Estimate reflects only the resolved agent, and the still-loading one is
    // excluded from the computation WITHOUT being reported as "no history".
    expect(screen.getByText("≈ 6s · $0.05 · parallel fan-out")).toBeInTheDocument();
    expect(screen.queryByText(/excludes/)).not.toBeInTheDocument();
  });

  it("AC-13 shell: renders the post-run meta line and the stable results slot once a group exists (T10/T11 mount point)", () => {
    mockSearchParams.current = new URLSearchParams("pr=42");
    mockPulls.current = { data: [{ id: "pr-uuid-1", number: 42, title: "Add rate limiting" }] };
    mockAgents.current = { data: [] };
    mockResult.current = {
      isLoading: false,
      data: {
        id: "run-1",
        pr_id: "pr-uuid-1",
        pr_number: 42,
        ran_at: "2026-07-13T00:00:00.000Z",
        agent_count: 2,
        total_duration_ms: 8200,
        total_cost_usd: 0.11,
        columns: [],
        conflicts: [],
      },
    };

    renderConfigureRun();

    // No doubled "s" from combining the formatted duration with the ICU template.
    expect(screen.getByText("2 agents · 8.2s total · $0.11 · parallel fan-out")).toBeInTheDocument();
    expect(screen.getByTestId("multi-agent-results-slot")).toBeInTheDocument();
  });

  it("shows the 'no run yet' empty state for a selected PR with no multi-agent group", () => {
    mockSearchParams.current = new URLSearchParams("pr=42");
    mockPulls.current = { data: [{ id: "pr-uuid-1", number: 42, title: "Add rate limiting" }] };
    mockResult.current = { data: null, isLoading: false };

    renderConfigureRun();

    expect(screen.getByText("No multi-agent run yet")).toBeInTheDocument();
    expect(screen.queryByTestId("multi-agent-results-slot")).not.toBeInTheDocument();
  });
});
