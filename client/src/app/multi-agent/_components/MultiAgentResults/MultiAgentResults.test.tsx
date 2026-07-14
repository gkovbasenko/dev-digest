import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { MultiAgentRun } from "@devdigest/shared";
import messages from "../../../../../messages/en/runs.json";

const { mockReplace, mockSearchParams } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  mockSearchParams: { current: new URLSearchParams("") },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => mockSearchParams.current,
}));

// Boundary mocks — AgentColumns/AgentTabs are independently tested; this file
// only verifies MultiAgentResults' own job (mode toggle + trace param wiring,
// AC-25/27), not their internals.
vi.mock("../AgentColumns", () => ({
  AgentColumns: ({ columns, onViewTrace }: { columns: { run_id: string }[]; onViewTrace: (id: string) => void }) => (
    <div data-testid="agent-columns">
      columns:{columns.length}
      <button type="button" onClick={() => onViewTrace(columns[0]!.run_id)}>
        open trace
      </button>
    </div>
  ),
}));
vi.mock("../AgentTabs", () => ({
  AgentTabs: () => <div data-testid="agent-tabs">tabs</div>,
}));
vi.mock("@/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer", () => ({
  default: ({ runId, onClose }: { runId: string; onClose: () => void }) => (
    <div data-testid="run-trace-drawer">
      trace for {runId}
      <button type="button" onClick={onClose}>
        close
      </button>
    </div>
  ),
}));

import { MultiAgentResults } from "./MultiAgentResults";

function makeResult(overrides: Partial<MultiAgentRun> = {}): MultiAgentRun {
  return {
    id: "run-group-1",
    pr_id: "pr-1",
    pr_number: 42,
    ran_at: "2026-07-13T00:00:00.000Z",
    agent_count: 1,
    total_duration_ms: 4000,
    total_cost_usd: 0.05,
    columns: [
      {
        run_id: "r1",
        agent_id: "a1",
        agent_name: "Security Reviewer",
        provider: "openai",
        model: "gpt-4.1",
        status: "done",
        verdict: "approve",
        score: 90,
        summary: null,
        duration_ms: 4000,
        cost_usd: 0.05,
        findings: [],
      },
    ],
    conflicts: [],
    ...overrides,
  };
}

function renderResults(result: MultiAgentRun) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <MultiAgentResults result={result} />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  mockReplace.mockReset();
  mockSearchParams.current = new URLSearchParams("");
});

describe("MultiAgentResults (AC-25/27)", () => {
  it("AC-27: defaults to Columns and switching to Tabs swaps the rendered view via plain local state (no run-triggering call)", () => {
    renderResults(makeResult());

    expect(screen.getByTestId("agent-columns")).toBeInTheDocument();
    expect(screen.queryByTestId("agent-tabs")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "tabs" }));

    expect(screen.queryByTestId("agent-columns")).not.toBeInTheDocument();
    expect(screen.getByTestId("agent-tabs")).toBeInTheDocument();
    // The toggle never touches router.replace (which is reserved for the
    // trace param) — switching views is a pure re-render, not a navigation.
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("AC-25: clicking View trace sets ?trace=<runId>, and the drawer mounts once that param is present", () => {
    renderResults(makeResult());

    fireEvent.click(screen.getByText("open trace"));
    expect(mockReplace).toHaveBeenCalledWith("/multi-agent?trace=r1");

    // Simulate the URL having updated (as router.replace would in the app).
    mockSearchParams.current = new URLSearchParams("trace=r1");
    const result = makeResult();
    cleanup();
    renderResults(result);

    expect(screen.getByTestId("run-trace-drawer")).toHaveTextContent("trace for r1");

    fireEvent.click(screen.getByText("close"));
    expect(mockReplace).toHaveBeenCalledWith("/multi-agent");
  });
});
