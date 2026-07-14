import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Finding } from "@devdigest/shared";
import messages from "../../../../../messages/en/prReview.json";

const { mockActionMutate, mockActionIsPending, mockCreateMutate, mockCreateIsPending } = vi.hoisted(() => ({
  mockActionMutate: vi.fn(),
  mockActionIsPending: { current: false },
  mockCreateMutate: vi.fn(),
  mockCreateIsPending: { current: false },
}));

vi.mock("@/lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: mockActionMutate, isPending: mockActionIsPending.current }),
}));

vi.mock("@/lib/hooks/eval", () => ({
  useCreateEvalCaseFromFinding: () => ({ mutate: mockCreateMutate, isPending: mockCreateIsPending.current }),
}));

import { FindingDetailActions } from "./FindingDetailActions";

afterEach(() => {
  cleanup();
  mockActionMutate.mockReset();
  mockCreateMutate.mockReset();
  mockActionIsPending.current = false;
  mockCreateIsPending.current = false;
});

const FINDING: Finding = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded Stripe secret key",
  file: "src/config.ts",
  start_line: 11,
  end_line: 11,
  rationale: "A **live** Stripe key is committed in source.",
  suggestion: "Move the key to an environment variable.",
  confidence: 0.95,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ prReview: messages }}>{ui}</NextIntlClientProvider>);
}

describe("FindingDetailActions (AC-31, AC-32)", () => {
  it("AC-31: Accept calls useFindingAction with the finding id", () => {
    renderWithIntl(<FindingDetailActions finding={FINDING} />);
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(mockActionMutate).toHaveBeenCalledWith({ findingId: "f1", action: "accept" });
  });

  it("AC-31: Dismiss calls useFindingAction with the finding id", () => {
    renderWithIntl(<FindingDetailActions finding={FINDING} />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(mockActionMutate).toHaveBeenCalledWith({ findingId: "f1", action: "dismiss" });
  });

  it("AC-31: 'Turn into eval case' calls the eval hook with the finding id", () => {
    renderWithIntl(<FindingDetailActions finding={FINDING} />);
    fireEvent.click(screen.getByRole("button", { name: "Turn into eval case" }));
    expect(mockCreateMutate).toHaveBeenCalledWith("f1");
  });

  it("does not fire a second 'Turn into eval case' call while one is pending (AC guard)", () => {
    mockCreateIsPending.current = true;
    renderWithIntl(<FindingDetailActions finding={FINDING} />);
    fireEvent.click(screen.getByRole("button", { name: "Turn into eval case" }));
    expect(mockCreateMutate).not.toHaveBeenCalled();
  });

  it("AC-32: Learn and Reply to author are visible but disabled, and clicking them makes no call", () => {
    renderWithIntl(<FindingDetailActions finding={FINDING} />);
    const learn = screen.getByRole("button", { name: "Learn" });
    const reply = screen.getByRole("button", { name: "Reply to author" });
    expect(learn).toBeDisabled();
    expect(reply).toBeDisabled();

    fireEvent.click(learn);
    fireEvent.click(reply);
    expect(mockActionMutate).not.toHaveBeenCalled();
    expect(mockCreateMutate).not.toHaveBeenCalled();
  });
});
