import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { MultiAgentRun } from "@devdigest/shared";
import messages from "../../../../../messages/en/runs.json";

const { mockReviews } = vi.hoisted(() => ({
  mockReviews: { current: { data: undefined as unknown } },
}));

vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: () => mockReviews.current,
}));

// FindingDetailActions is T11's stable, independently-tested action row —
// mocked here at the boundary so AgentTabs' own test asserts what IT is
// responsible for (selection + confidence/suggestion), not T11's internals.
vi.mock("../FindingDetailActions", () => ({
  FindingDetailActions: ({ finding }: { finding: { id: string } }) => (
    <div data-testid="finding-detail-actions">actions for {finding.id}</div>
  ),
}));

import { AgentTabs } from "./AgentTabs";

function makeResult(overrides: Partial<MultiAgentRun> = {}): MultiAgentRun {
  return {
    id: "run-group-1",
    pr_id: "pr-1",
    pr_number: 42,
    ran_at: "2026-07-13T00:00:00.000Z",
    agent_count: 2,
    total_duration_ms: 8000,
    total_cost_usd: 0.1,
    columns: [
      {
        run_id: "r1",
        agent_id: "a1",
        agent_name: "Security Reviewer",
        provider: "openai",
        model: "gpt-4.1",
        status: "done",
        verdict: "request_changes",
        score: 70,
        summary: "Found one critical issue.",
        duration_ms: 4000,
        cost_usd: 0.05,
        findings: [
          { id: "f1", severity: "CRITICAL", category: "security", title: "Hardcoded secret", file: "a.ts", start_line: 10, kind: "finding" },
        ],
      },
      {
        run_id: "r2",
        agent_id: "a2",
        agent_name: "Perf Reviewer",
        provider: "openai",
        model: "gpt-4.1",
        status: "done",
        verdict: "approve",
        score: 95,
        summary: null,
        duration_ms: 3000,
        cost_usd: 0.04,
        findings: [],
      },
    ],
    conflicts: [],
    ...overrides,
  };
}

function renderTabs(result: MultiAgentRun) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <AgentTabs result={result} />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  mockReviews.current = { data: undefined };
});

describe("AgentTabs (AC-26)", () => {
  it("renders one tab per agent (persona + finding-count) and selecting a finding shows confidence, suggestion and the action row", () => {
    mockReviews.current = {
      data: [
        {
          id: "review-1",
          pr_id: "pr-1",
          agent_id: "a1",
          run_id: "r1",
          agent_name: "Security Reviewer",
          kind: "review",
          verdict: "request_changes",
          summary: "Found one critical issue.",
          score: 70,
          model: "gpt-4.1",
          grounding: null,
          created_at: "2026-07-13T00:00:00.000Z",
          findings: [
            {
              id: "f1",
              severity: "CRITICAL",
              category: "security",
              title: "Hardcoded secret",
              file: "a.ts",
              start_line: 10,
              end_line: 10,
              rationale: "This key is checked into source control.",
              suggestion: "Move it to an environment variable.",
              confidence: 0.92,
              kind: "finding",
              trifecta_components: null,
              evidence: null,
              review_id: "review-1",
              accepted_at: null,
              dismissed_at: null,
            },
          ],
        },
      ],
    };

    renderTabs(makeResult());

    // Tab labels are the agent's persona/name, with a finding-count badge.
    expect(screen.getByRole("button", { name: /Security Reviewer/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Perf Reviewer/ })).toBeInTheDocument();

    // Before any selection: a neutral "pick a finding" empty state.
    expect(screen.getByText("Select a finding to see its detail.")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Hardcoded secret"));

    expect(screen.getByText("This key is checked into source control.")).toBeInTheDocument();
    expect(screen.getByText("Move it to an environment variable.")).toBeInTheDocument();
    expect(screen.getByText("92% conf")).toBeInTheDocument();
    expect(screen.getByTestId("finding-detail-actions")).toHaveTextContent("actions for f1");
  });

  it("switching agent tabs drops the finding selection back to the empty state", () => {
    mockReviews.current = { data: [] };
    renderTabs(makeResult());

    expect(screen.getByText("Select a finding to see its detail.")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Hardcoded secret"));
    expect(screen.queryByText("Select a finding to see its detail.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Perf Reviewer/ }));
    expect(screen.getByText("Select a finding to see its detail.")).toBeInTheDocument();
  });

  it("an agent with no findings shows the shared no-findings note instead of a list", () => {
    mockReviews.current = { data: [] };
    renderTabs(makeResult());
    fireEvent.click(screen.getByRole("button", { name: /Perf Reviewer/ }));
    expect(screen.getByText("No findings.")).toBeInTheDocument();
  });
});
