import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { EvalRunRecord } from "@devdigest/shared";
import { CompareView } from "./CompareView";

/* The prompt diff + Promote action read the agent-version hooks; mock them so
   the component renders without a QueryClient. `mutateMock` is hoisted so the
   factory (itself hoisted by vi.mock) can close over it. */
const { mutateMock } = vi.hoisted(() => ({ mutateMock: vi.fn() }));

const PROMPT_V2 = "You are a security reviewer.\nReturn at most 5 findings.";
const PROMPT_V3 = "You are a security reviewer.\nReturn at most 5 findings.\nFlag unused imports as suggestions.";

vi.mock("@/lib/hooks/agents", () => ({
  useAgentVersion: (agentId: string, version: number) => ({
    data: {
      agent_id: agentId,
      version,
      created_at: "2026-07-01T00:00:00.000Z",
      config: {
        provider: "openai",
        model: "gpt-4.1",
        system_prompt: version === 3 ? PROMPT_V3 : PROMPT_V2,
        output_schema: null,
        strategy: "single",
        ci_fail_on: "none",
        repo_intel: false,
        skills: [],
      },
    },
    isError: false,
  }),
  useUpdateAgent: () => ({ mutate: mutateMock, isPending: false }),
}));

afterEach(() => {
  cleanup();
  mutateMock.mockClear();
});

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

describe("CompareView", () => {
  it("renders the version-titled modal with old→new metric tiles and point deltas", () => {
    render(<CompareView a={RUN_A} b={RUN_B} onClose={vi.fn()} />);

    expect(screen.getByText("Compare runs · v2 → v3")).toBeInTheDocument();

    // old → new raw values for each tile.
    expect(screen.getByText("70%")).toBeInTheDocument();
    expect(screen.getByText("85%")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(screen.getByText("55%")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getByText("88%")).toBeInTheDocument();

    // point-deltas: recall +15pt, precision -5pt, citation +8pt.
    expect(screen.getByText("15pt")).toBeInTheDocument();
    expect(screen.getByText("5pt")).toBeInTheDocument();
    expect(screen.getByText("8pt")).toBeInTheDocument();
  });

  it("drops pass-count from the compare (screenshot design)", () => {
    render(<CompareView a={RUN_A} b={RUN_B} onClose={vi.fn()} />);
    expect(screen.queryByText(/Pass count/i)).not.toBeInTheDocument();
    expect(screen.queryByText("14/20")).not.toBeInTheDocument();
  });

  it("renders the system-prompt diff, highlighting the added line", () => {
    render(<CompareView a={RUN_A} b={RUN_B} onClose={vi.fn()} />);
    expect(screen.getByText("System prompt diff")).toBeInTheDocument();
    expect(screen.getByText("Flag unused imports as suggestions.")).toBeInTheDocument();
  });

  it("Promote v3 restores version B's config via the update mutation", () => {
    render(<CompareView a={RUN_A} b={RUN_B} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Promote v3/ }));

    expect(mutateMock).toHaveBeenCalledOnce();
    const [vars] = mutateMock.mock.calls[0]!;
    expect(vars.id).toBe("ag-1");
    expect(vars.patch.system_prompt).toBe(PROMPT_V3);
  });

  it("calls onClose from the footer Close button", () => {
    const onClose = vi.fn();
    render(<CompareView a={RUN_A} b={RUN_B} onClose={onClose} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]!);
    expect(onClose).toHaveBeenCalled();
  });
});
