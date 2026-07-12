import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { EvalCase, EvalRunRecord } from "@devdigest/shared";

const {
  mockPush,
  mockCases,
  mockRuns,
  mockRunAllMutate,
  mockRunAllIsPending,
  mockRunCaseMutate,
  mockDeleteMutate,
  mockUpdateMutate,
} = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockCases: { current: [] as EvalCase[] },
  mockRuns: { current: [] as EvalRunRecord[] },
  mockRunAllMutate: vi.fn(),
  mockRunAllIsPending: { current: false },
  mockRunCaseMutate: vi.fn(),
  mockDeleteMutate: vi.fn(),
  mockUpdateMutate: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: "repo1" }),
}));

vi.mock("@/lib/hooks/eval", () => ({
  useAgentEvalCases: () => ({ data: mockCases.current }),
  useAgentEvalRuns: () => ({ data: mockRuns.current }),
  useRunAgentEvals: () => ({ mutate: mockRunAllMutate, isPending: mockRunAllIsPending.current }),
  useRunEvalCase: () => ({ mutate: mockRunCaseMutate, isPending: false }),
  useDeleteEvalCase: () => ({ mutate: mockDeleteMutate, isPending: false }),
  useUpdateEvalCase: () => ({ mutate: mockUpdateMutate, isPending: false }),
}));

import { EvalsTab } from "./EvalsTab";

afterEach(() => {
  cleanup();
  mockPush.mockReset();
  mockCases.current = [];
  mockRuns.current = [];
  mockRunAllMutate.mockReset();
  mockRunAllIsPending.current = false;
  mockRunCaseMutate.mockReset();
  mockDeleteMutate.mockReset();
  mockUpdateMutate.mockReset();
});

function makeCase(id: string, name: string, expectedOutput: unknown): EvalCase {
  return {
    id,
    owner_kind: "agent",
    owner_id: "ag1",
    name,
    input_diff: "diff --git a/x.ts b/x.ts\n+foo",
    input_files: ["x.ts"],
    input_meta: { pr_number: 1, pr_title: "t", head_sha: "abc" },
    expected_output: expectedOutput,
    notes: null,
    source_finding_id: null,
  };
}

const PASS_CASE = makeCase("c1", "detects-secret", {
  must_find: [{ file: "a.ts", start_line: 1, end_line: 2, severity: "CRITICAL", category: "security", title: "x" }],
  must_not_flag: [],
});
const FAIL_CASE = makeCase("c2", "flags-bug", {
  must_find: [{ file: "b.ts", start_line: 3, end_line: 4, severity: "WARNING", category: "bug", title: "y" }],
  must_not_flag: [],
});
const NEVER_RUN_CASE = makeCase("c3", "no-false-positive", {
  must_find: [],
  must_not_flag: [{ file: "c.ts", start_line: 5, end_line: 6 }],
});

function makeRun(overrides: Partial<EvalRunRecord> = {}): EvalRunRecord {
  return {
    id: "run1",
    owner_id: "ag1",
    owner_kind: "agent",
    owner_version: 1,
    ran_at: "2026-07-10T00:00:00.000Z",
    recall: 0.6,
    precision: 0.5,
    citation_accuracy: 0.8,
    traces_passed: 1,
    traces_total: 2,
    case_results: [
      { case_id: "c1", name: "detects-secret", pass: true, expected: 2, got: 2, recall: 1, precision: 1, cost_usd: null, duration_ms: 10, actual: [] },
      { case_id: "c2", name: "flags-bug", pass: false, expected: 3, got: 1, recall: 0.33, precision: 0.5, cost_usd: null, duration_ms: 20, actual: [] },
    ],
    duration_ms: 30,
    cost_usd: null,
    ...overrides,
  };
}

describe("EvalsTab (AC-5)", () => {
  it("renders three distinct status icons with correct expected/got text, incl. never run, and severity·category badges", () => {
    mockCases.current = [PASS_CASE, FAIL_CASE, NEVER_RUN_CASE];
    mockRuns.current = [makeRun()];

    render(<EvalsTab agentId="ag1" />);

    // Status icons: one Pass, one Fail, one Never run — each with its text label.
    expect(screen.getByText("Pass")).toBeInTheDocument();
    expect(screen.getByText("Fail")).toBeInTheDocument();
    expect(screen.getByText("Never run")).toBeInTheDocument();

    // Per-case expected/got text.
    expect(screen.getByText("expected 2 findings, got 2")).toBeInTheDocument();
    expect(screen.getByText("expected 3 findings, got 1")).toBeInTheDocument();
    expect(screen.getByText("never run")).toBeInTheDocument();

    // Badge: must_find cases show their category tag; the must_not_flag-only
    // (clean) case shows the "[]" fallback instead.
    expect(screen.getByText("security")).toBeInTheDocument();
    expect(screen.getByText("bug")).toBeInTheDocument();
    expect(screen.getByText("[]")).toBeInTheDocument();
  });
});

describe("EvalsTab — per-case status across separate single-case runs", () => {
  it("keeps each case's status from its own most recent run instead of flipping others to 'never run'", () => {
    // Single-case runs each persist their own eval_runs row holding only that
    // case. c1 ran later (newer), c2 earlier — both must keep their status.
    mockCases.current = [PASS_CASE, FAIL_CASE];
    mockRuns.current = [
      makeRun({
        id: "runA",
        ran_at: "2026-07-11T00:00:00.000Z",
        case_results: [
          { case_id: "c1", name: "detects-secret", pass: true, expected: 2, got: 2, recall: 1, precision: 1, cost_usd: null, duration_ms: 10, actual: [] },
        ],
      }),
      makeRun({
        id: "runB",
        ran_at: "2026-07-10T00:00:00.000Z",
        case_results: [
          { case_id: "c2", name: "flags-bug", pass: false, expected: 3, got: 1, recall: 0.33, precision: 0.5, cost_usd: null, duration_ms: 20, actual: [] },
        ],
      }),
    ];

    render(<EvalsTab agentId="ag1" />);

    expect(screen.getByText("Pass")).toBeInTheDocument();
    expect(screen.getByText("Fail")).toBeInTheDocument();
    expect(screen.queryByText("Never run")).not.toBeInTheDocument();
    expect(screen.getByText("expected 2 findings, got 2")).toBeInTheDocument();
    expect(screen.getByText("expected 3 findings, got 1")).toBeInTheDocument();
  });

  it("shows a 'Running…' status on every case row while a batch run is in flight", () => {
    mockCases.current = [PASS_CASE, FAIL_CASE];
    mockRuns.current = [makeRun()];
    mockRunAllIsPending.current = true;

    render(<EvalsTab agentId="ag1" />);

    // Both rows flip to the running indicator; prior pass/fail labels are hidden.
    expect(screen.getAllByText("Running…").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("Pass")).not.toBeInTheDocument();
    expect(screen.queryByText("Fail")).not.toBeInTheDocument();
  });

  it("opens the editor when a case row is clicked (not only the edit icon)", () => {
    mockCases.current = [PASS_CASE];
    mockRuns.current = [makeRun()];

    render(<EvalsTab agentId="ag1" />);

    // Clicking anywhere on the row (here the case name) bubbles to the row's
    // onClick and opens the editor — not just the pencil icon.
    fireEvent.click(screen.getByText("detects-secret"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("EvalsTab (AC-6)", () => {
  it("shows four em-dash metric cards when the agent has no eval runs yet", () => {
    mockCases.current = [PASS_CASE];
    mockRuns.current = [];

    render(<EvalsTab agentId="ag1" />);

    expect(screen.getAllByText("—")).toHaveLength(4);
    expect(screen.getByText("Evals")).toBeInTheDocument();
  });

  it('shows "TRACES PASSED 17/20" and the passing header when the latest run has case counts', () => {
    mockCases.current = [PASS_CASE, FAIL_CASE];
    mockRuns.current = [makeRun({ traces_passed: 17, traces_total: 20 })];

    render(<EvalsTab agentId="ag1" />);

    expect(screen.getByText("TRACES PASSED")).toBeInTheDocument();
    expect(screen.getByText("17/20")).toBeInTheDocument();
    expect(screen.getByText("Eval cases 17/20 passing")).toBeInTheDocument();
  });
});

describe("EvalsTab — empty state", () => {
  it("shows a 'New eval case' prompt (no bare create endpoint) that links out to the Pull Requests list", () => {
    mockCases.current = [];
    mockRuns.current = [];

    render(<EvalsTab agentId="ag1" />);

    expect(screen.getByText("No eval cases yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "New eval case" }));
    expect(mockPush).toHaveBeenCalledWith("/repos/repo1/pulls");
  });
});

describe("EvalsTab — actions", () => {
  it("runs, opens the editor for, and deletes a case via the row actions", () => {
    mockCases.current = [PASS_CASE];
    mockRuns.current = [makeRun()];
    window.confirm = vi.fn(() => true);

    render(<EvalsTab agentId="ag1" />);

    fireEvent.click(screen.getByRole("button", { name: "Run detects-secret" }));
    expect(mockRunCaseMutate).toHaveBeenCalledWith("c1");

    fireEvent.click(screen.getByRole("button", { name: "Edit detects-secret" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete detects-secret" }));
    expect(mockDeleteMutate).toHaveBeenCalledWith("c1");
  });

  it("disables 'Run all' when the case set is empty and enables it otherwise", () => {
    mockCases.current = [];
    mockRuns.current = [];
    const { rerender } = render(<EvalsTab agentId="ag1" />);
    expect(screen.getByRole("button", { name: "Run all" })).toBeDisabled();

    mockCases.current = [PASS_CASE];
    rerender(<EvalsTab agentId="ag1" />);
    expect(screen.getByRole("button", { name: "Run all" })).not.toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Run all" }));
    expect(mockRunAllMutate).toHaveBeenCalledWith("ag1");
  });
});
