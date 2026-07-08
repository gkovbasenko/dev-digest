import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { ContextDocument, ContextDocList } from "@devdigest/shared";

const {
  mockMutate,
  mockIsPending,
  mockDocList,
  mockLinks,
  mockPreview,
} = vi.hoisted(() => ({
  mockMutate: vi.fn(),
  mockIsPending: { current: false },
  mockDocList: { current: undefined as ContextDocList | undefined },
  mockLinks: { current: [] as { path: string; order: number }[] },
  mockPreview: { current: { content: "" } },
}));

vi.mock("../../../../../../../lib/hooks/context", () => ({
  useContextDocs: () => ({ data: mockDocList.current }),
  useAgentContext: () => ({ data: mockLinks.current }),
  useSetAgentContext: () => ({ mutate: mockMutate, isPending: mockIsPending.current }),
  useContextFilePreview: () => ({ data: mockPreview.current, isLoading: false }),
}));

vi.mock("../../../../../../../lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: "repo1" }),
}));

import { ContextTab } from "./ContextTab";

const DOC_A: ContextDocument = { path: "specs/a.md", badge: "specs", token_count: 100 };
const DOC_B: ContextDocument = { path: "docs/b.md", badge: "docs", token_count: 217 };
const DOC_C: ContextDocument = { path: "insights/c.md", badge: "insights", token_count: 50 };

function setDocs(documents: ContextDocument[]) {
  mockDocList.current = { indexed: true, documents };
}

afterEach(() => {
  cleanup();
  mockMutate.mockReset();
  mockIsPending.current = false;
  setDocs([DOC_A, DOC_B]);
  mockLinks.current = [{ path: "specs/a.md", order: 0 }];
  mockPreview.current = { content: "" };
});

setDocs([DOC_A, DOC_B]);
mockLinks.current = [{ path: "specs/a.md", order: 0 }];

describe("ContextTab — attach/detach", () => {
  it("toggling an unattached doc calls useSetAgentContext with the expected ordered paths + active repoId", () => {
    render(<ContextTab agentId="ag1" />);
    // specs/a.md is already attached (checked); docs/b.md is not.
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[1]!);

    expect(mockMutate).toHaveBeenCalledWith(
      { paths: ["specs/a.md", "docs/b.md"], repoId: "repo1" },
      expect.any(Object),
    );
  });

  it("shows the header as 'N of M attached'", () => {
    render(<ContextTab agentId="ag1" />);
    expect(screen.getByText("Project context — 1 of 2 attached")).toBeInTheDocument();
  });

  it("rolls back the optimistic attach when the mutation fails", async () => {
    mockMutate.mockImplementation((_v: unknown, opts?: { onError?: () => void }) => opts?.onError?.());
    render(<ContextTab agentId="ag1" />);
    fireEvent.click(screen.getAllByRole("checkbox")[1]!);

    await waitFor(() => {
      expect(screen.getByText("Project context — 1 of 2 attached")).toBeInTheDocument();
    });
  });
});

describe("ContextTab — footer token aggregate", () => {
  it("shows the aggregate token count for all attached docs (100 + 217 = 317)", () => {
    mockLinks.current = [
      { path: "specs/a.md", order: 0 },
      { path: "docs/b.md", order: 1 },
    ];
    render(<ContextTab agentId="ag1" />);
    expect(screen.getByText(/≈317 tokens/)).toBeInTheDocument();
  });
});

describe("ContextTab — caps", () => {
  it("blocks the attach control for a doc over the 50k-token per-doc cap — no mutation fires", () => {
    const HUGE: ContextDocument = { path: "specs/huge.md", badge: "specs", token_count: 60_000 };
    setDocs([DOC_A, HUGE]);
    render(<ContextTab agentId="ag1" />);

    // specs/a.md checkbox is index 0 (attached), huge.md is index 1 (unattached).
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[1]!);

    expect(mockMutate).not.toHaveBeenCalled();
    expect(screen.getByText("over cap")).toBeInTheDocument();
  });

  it("blocks the save (shows a cap warning, no mutation) when attaching would push the aggregate over 150k", () => {
    // Three docs already attached, each comfortably under the 50k per-doc cap
    // (49,000 each, summing to 147,000 — under the 150k aggregate cap).
    // Attaching a fourth 49,000-token doc (also under the per-doc cap) pushes
    // the total to 196,000, over AGGREGATE_TOKEN_CAP (150,000) — isolates the
    // aggregate check from the per-doc one.
    const D1: ContextDocument = { path: "specs/d1.md", badge: "specs", token_count: 49_000 };
    const D2: ContextDocument = { path: "specs/d2.md", badge: "specs", token_count: 49_000 };
    const D3: ContextDocument = { path: "specs/d3.md", badge: "specs", token_count: 49_000 };
    const D4: ContextDocument = { path: "specs/d4.md", badge: "specs", token_count: 49_000 };
    setDocs([D1, D2, D3, D4]);
    mockLinks.current = [
      { path: "specs/d1.md", order: 0 },
      { path: "specs/d2.md", order: 1 },
      { path: "specs/d3.md", order: 2 },
    ];
    render(<ContextTab agentId="ag1" />);

    // D1/D2/D3 are attached (checked, rendered first); D4 is the sole
    // unattached row, so it's the last checkbox.
    const d4Checkbox = screen.getAllByRole("checkbox").at(-1)!;
    fireEvent.click(d4Checkbox);

    expect(mockMutate).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/over the 150,000-token aggregate cap/);
  });
});

describe("ContextTab — drag reorder", () => {
  it("reorders attached docs via drag, committing the swapped order", () => {
    mockLinks.current = [
      { path: "specs/a.md", order: 0 },
      { path: "docs/b.md", order: 1 },
      { path: "insights/c.md", order: 2 },
    ];
    setDocs([DOC_A, DOC_B, DOC_C]);
    render(<ContextTab agentId="ag1" />);

    const rowA = screen.getByText("specs/a.md").closest("[draggable]")!;
    const rowC = screen.getByText("insights/c.md").closest("[draggable]")!;

    fireEvent.dragStart(rowA);
    fireEvent.dragOver(rowC);
    fireEvent.dragEnd(rowA);

    expect(mockMutate).toHaveBeenCalledWith(
      { paths: ["docs/b.md", "insights/c.md", "specs/a.md"], repoId: "repo1" },
      expect.any(Object),
    );
  });

  it("does not start a new drag (and never fires a second mutation) while a mutation is already pending", () => {
    mockIsPending.current = true;
    render(<ContextTab agentId="ag1" />);
    const rowA = screen.getByText("specs/a.md").closest("[draggable]")!;

    fireEvent.dragStart(rowA);
    fireEvent.dragEnd(rowA);

    expect(mockMutate).not.toHaveBeenCalled();
  });
});

describe("ContextTab — preview", () => {
  it("clicking preview shows the doc's read-only content", () => {
    mockPreview.current = { content: "Some rule text." };
    render(<ContextTab agentId="ag1" />);
    fireEvent.click(screen.getByRole("button", { name: "Preview specs/a.md" }));
    expect(screen.getByText("Some rule text.")).toBeInTheDocument();
  });
});
