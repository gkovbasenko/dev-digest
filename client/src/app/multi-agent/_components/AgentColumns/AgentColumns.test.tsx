import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { AgentColumn } from "@devdigest/shared";
import messages from "../../../../../messages/en/runs.json";

const { mockRunEvents } = vi.hoisted(() => ({
  mockRunEvents: { current: { events: [] as { runId: string; kind: string }[], running: false } },
}));

// Stable reference mock (client INSIGHTS 2026-07-01 OOM gotcha) — the ref
// object itself is reused across renders; only its `.current` is swapped.
vi.mock("@/lib/hooks/reviews", () => ({
  useRunEvents: () => mockRunEvents.current,
}));

import { AgentColumns } from "./AgentColumns";

function col(overrides: Partial<AgentColumn> = {}): AgentColumn {
  return {
    run_id: "run-1",
    agent_id: "agent-1",
    agent_name: "Security Reviewer",
    provider: "openai",
    model: "gpt-4.1",
    status: "done",
    verdict: "approve",
    score: 92,
    summary: "Looks good.",
    duration_ms: 4000,
    cost_usd: 0.05,
    findings: [],
    ...overrides,
  };
}

function renderColumns(columns: AgentColumn[], onViewTrace = vi.fn()) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <AgentColumns columns={columns} onViewTrace={onViewTrace} />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  mockRunEvents.current = { events: [], running: false };
});

describe("AgentColumns (AC-23/24/25/30)", () => {
  it("AC-23/25: renders one header per column with status + cost/duration (null-safe) and a working View trace button", () => {
    const onViewTrace = vi.fn();
    const columns = [
      col({ run_id: "r1", agent_id: "a1", agent_name: "Security Reviewer" }),
      col({ run_id: "r2", agent_id: "a2", agent_name: "Perf Reviewer", status: "running", score: null, duration_ms: null, cost_usd: null }),
      col({ run_id: "r3", agent_id: "a3", agent_name: "Style Reviewer", status: "failed" }),
      col({ run_id: "r4", agent_id: "a4", agent_name: "Test Reviewer" }),
    ];
    renderColumns(columns, onViewTrace);

    // 4 columns, each with its own "View trace" action.
    const traceButtons = screen.getAllByRole("button", { name: "View trace" });
    expect(traceButtons).toHaveLength(4);

    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
    // Never a fabricated "$NaN" for a running column with no cost yet.
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
    expect(screen.getAllByText("n/a").length).toBeGreaterThan(0);

    fireEvent.click(traceButtons[0]!);
    expect(onViewTrace).toHaveBeenCalledWith("r1");
  });

  it("AC-30: a failed column's header reads 'Errored', not a generic done/failed label", () => {
    renderColumns([col({ run_id: "r1", status: "failed" })]);
    expect(screen.getByText("Errored")).toBeInTheDocument();
  });

  it("AC-24: a fake SSE 'result' event flips a running column's status text to Done, without a reload", () => {
    const columns = [col({ run_id: "r1", status: "running", score: null, duration_ms: null, cost_usd: null })];
    const { rerender } = renderColumns(columns);
    expect(screen.getByText("Running…")).toBeInTheDocument();

    mockRunEvents.current = { events: [{ runId: "r1", kind: "result" }], running: false };
    rerender(
      <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
        <AgentColumns columns={columns} onViewTrace={vi.fn()} />
      </NextIntlClientProvider>,
    );

    expect(screen.queryByText("Running…")).not.toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
  });

  it("shows a finding row and count, or the no-findings empty note", () => {
    renderColumns([
      col({ run_id: "r1", findings: [{ id: "f1", severity: "CRITICAL", category: "security", title: "Hardcoded secret", file: "a.ts", start_line: 1, kind: "finding" }] }),
      col({ run_id: "r2", agent_id: "a2", findings: [] }),
    ]);
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("1 finding")).toBeInTheDocument();
    expect(screen.getByText("No findings.")).toBeInTheDocument();
  });
});
