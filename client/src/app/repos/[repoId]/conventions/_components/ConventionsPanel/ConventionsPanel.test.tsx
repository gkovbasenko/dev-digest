import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { ConventionCandidate } from "@devdigest/shared";

const {
  mockConventions,
  mockIsLoading,
  mockIsError,
  mockExtractMutate,
  mockExtractPending,
  mockActionMutate,
  mockActionPending,
  mockRefetch,
} = vi.hoisted(() => ({
  mockConventions: { current: [] as ConventionCandidate[] },
  mockIsLoading: { current: false },
  mockIsError: { current: false },
  mockExtractMutate: vi.fn(),
  mockExtractPending: { current: false },
  mockActionMutate: vi.fn(),
  mockActionPending: { current: false },
  mockRefetch: vi.fn(),
}));

vi.mock("@/lib/hooks/conventions", () => ({
  useConventions: () => ({
    data: mockConventions.current,
    isLoading: mockIsLoading.current,
    isError: mockIsError.current,
    error: null,
    refetch: mockRefetch,
  }),
  useExtractConventions: () => ({ mutate: mockExtractMutate, isPending: mockExtractPending.current }),
  useConventionAction: () => ({ mutate: mockActionMutate, isPending: mockActionPending.current }),
}));

vi.mock("../BundleSkillModal", () => ({
  BundleSkillModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="bundle-modal">
      <button onClick={onClose}>close-bundle-modal</button>
    </div>
  ),
}));

import { ConventionsPanel } from "./ConventionsPanel";

afterEach(() => {
  cleanup();
  mockConventions.current = [];
  mockIsLoading.current = false;
  mockIsError.current = false;
  mockExtractPending.current = false;
  mockExtractMutate.mockReset();
  mockActionMutate.mockReset();
  mockActionPending.current = false;
  mockRefetch.mockReset();
});

const CANDIDATE: ConventionCandidate = {
  id: "c1",
  rule: "Service classes are named with a Service suffix",
  category: "naming",
  evidence_path: "src/modules/foo/service.ts",
  evidence_snippet: "export class FooService",
  confidence: 0.9,
  accepted: false,
  rejected: false,
};

describe("ConventionsPanel", () => {
  it("shows an empty state when there are no candidates", () => {
    render(<ConventionsPanel repoId="repo1" />);
    expect(screen.getByText("No conventions extracted yet")).toBeInTheDocument();
  });

  it("renders each convention candidate when present", () => {
    mockConventions.current = [CANDIDATE];
    render(<ConventionsPanel repoId="repo1" />);
    expect(screen.getByText(CANDIDATE.rule)).toBeInTheDocument();
    expect(screen.getByText("0 of 1 accepted")).toBeInTheDocument();
  });

  it("fires the extract mutation when 'Extract conventions' is clicked", () => {
    render(<ConventionsPanel repoId="repo1" />);
    fireEvent.click(screen.getByText("Extract conventions"));
    expect(mockExtractMutate).toHaveBeenCalled();
  });

  it("shows 'Extracting…' and disables the button while extraction is pending", () => {
    mockExtractPending.current = true;
    render(<ConventionsPanel repoId="repo1" />);
    const btn = screen.getByText("Extracting…").closest("button")!;
    expect(btn).toBeDisabled();
    expect(screen.queryByText("Extract conventions")).not.toBeInTheDocument();
  });

  it("disables 'Create skill from accepted' when nothing is accepted yet", () => {
    mockConventions.current = [CANDIDATE];
    render(<ConventionsPanel repoId="repo1" />);
    expect(screen.getByText("Create skill from accepted").closest("button")).toBeDisabled();
  });

  it("enables 'Create skill from accepted' and opens the bundle modal once something is accepted", () => {
    mockConventions.current = [{ ...CANDIDATE, accepted: true }];
    render(<ConventionsPanel repoId="repo1" />);
    const btn = screen.getByText("Create skill from accepted").closest("button")!;
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(screen.getByTestId("bundle-modal")).toBeInTheDocument();
  });

  it("forwards a card action to the convention-action mutation", () => {
    mockConventions.current = [CANDIDATE];
    render(<ConventionsPanel repoId="repo1" />);
    fireEvent.click(screen.getByText("Accept"));
    expect(mockActionMutate).toHaveBeenCalledWith({
      id: "c1",
      repoId: "repo1",
      patch: { accepted: true },
    });
  });

  it("disables every card's Accept/Reject/Edit buttons while a convention action is pending", () => {
    mockConventions.current = [CANDIDATE, { ...CANDIDATE, id: "c2", rule: "Another rule" }];
    mockActionPending.current = true;
    render(<ConventionsPanel repoId="repo1" />);
    for (const btnText of ["Accept", "Reject", "Edit"]) {
      for (const btn of screen.getAllByText(btnText)) {
        expect(btn.closest("button")).toBeDisabled();
      }
    }
  });

  it("shows loading skeletons while isLoading", () => {
    mockIsLoading.current = true;
    const { container } = render(<ConventionsPanel repoId="repo1" />);
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
    expect(screen.queryByText("No conventions extracted yet")).not.toBeInTheDocument();
  });

  it("shows an error state on fetch failure", () => {
    mockIsError.current = true;
    render(<ConventionsPanel repoId="repo1" />);
    expect(screen.getByText("Could not load conventions")).toBeInTheDocument();
  });

  it("calls refetch when the error state's Retry button is clicked", () => {
    mockIsError.current = true;
    render(<ConventionsPanel repoId="repo1" />);
    fireEvent.click(screen.getByText("Retry"));
    expect(mockRefetch).toHaveBeenCalledOnce();
  });
});
