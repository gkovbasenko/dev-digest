import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, EvalCase } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

const { mockCreateMutate, mockCreateIsPending, mockUpdateMutate, mockRunMutate } = vi.hoisted(() => ({
  mockCreateMutate: vi.fn(),
  mockCreateIsPending: { current: false },
  mockUpdateMutate: vi.fn(),
  mockRunMutate: vi.fn(),
}));

// FindingCard uses useCreateEvalCaseFromFinding directly; EvalCaseEditor (which
// it opens on success) also pulls useUpdateEvalCase/useRunEvalCase from the
// same module — mock all three so no real TanStack Query provider is needed.
vi.mock("@/lib/hooks/eval", () => ({
  useCreateEvalCaseFromFinding: () => ({ mutate: mockCreateMutate, isPending: mockCreateIsPending.current }),
  useUpdateEvalCase: () => ({ mutate: mockUpdateMutate, isPending: false }),
  useRunEvalCase: () => ({ mutate: mockRunMutate, isPending: false }),
}));

import { FindingCard } from "./FindingCard";

afterEach(() => {
  cleanup();
  mockCreateMutate.mockReset();
  mockUpdateMutate.mockReset();
  mockRunMutate.mockReset();
  mockCreateIsPending.current = false;
});

const FINDING: FindingRecord = {
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
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
};

/** The server (T3) pre-fills expected_output from the finding on create;
    these mirror its shape for accepted/dismissed so the mocked mutation can
    hand FindingCard the same payload it would get from the real endpoint. */
function acceptedEvalCase(f: FindingRecord): EvalCase {
  return {
    id: "case-accepted",
    owner_kind: "agent",
    owner_id: "agent-1",
    name: "eval-case-from-accepted",
    input_diff: "diff --git a/src/config.ts b/src/config.ts\n+foo",
    input_files: [f.file],
    input_meta: { pr_number: 1, pr_title: "PR", head_sha: "sha1" },
    expected_output: {
      must_find: [
        {
          file: f.file,
          start_line: f.start_line,
          end_line: f.end_line,
          severity: f.severity,
          category: f.category,
          title: f.title,
        },
      ],
      must_not_flag: [],
    },
    notes: null,
    source_finding_id: f.id,
  };
}

function dismissedEvalCase(f: FindingRecord): EvalCase {
  return {
    id: "case-dismissed",
    owner_kind: "agent",
    owner_id: "agent-1",
    name: "eval-case-from-dismissed",
    input_diff: "diff --git a/src/config.ts b/src/config.ts\n+foo",
    input_files: [f.file],
    input_meta: { pr_number: 1, pr_title: "PR", head_sha: "sha1" },
    expected_output: {
      must_find: [],
      must_not_flag: [{ file: f.file, start_line: f.start_line, end_line: f.end_line }],
    },
    notes: null,
    source_finding_id: f.id,
  };
}

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingCard (smoke, both themes)", () => {
  (["dark", "light"] as const).forEach((theme) => {
    it(`renders severity + file:line + rationale in ${theme}`, () => {
      renderWithIntl(
        <div data-theme={theme}>
          <FindingCard f={FINDING} defaultExpanded onAction={() => {}} />
        </div>,
      );
      expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
      expect(screen.getByText("src/config.ts:11")).toBeInTheDocument();
      // category label is shown alongside the severity badge
      expect(screen.getByText("security")).toBeInTheDocument();
    });
  });

  it("fires accept/dismiss actions", () => {
    const onAction = vi.fn();
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded onAction={onAction} />);
    fireEvent.click(screen.getByText("Accept"));
    expect(onAction).toHaveBeenCalledWith("accept");
    fireEvent.click(screen.getByText("Dismiss"));
    expect(onAction).toHaveBeenCalledWith("dismiss");
  });
});

describe("FindingCard — Turn into eval case", () => {
  it("hides the action for a finding that is neither accepted nor dismissed", () => {
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded onAction={() => {}} />);
    expect(screen.queryByRole("button", { name: "Turn into eval case" })).not.toBeInTheDocument();
  });

  it("shows the action for an accepted finding", () => {
    const accepted = { ...FINDING, accepted_at: "2026-07-10T00:00:00Z" };
    renderWithIntl(<FindingCard f={accepted} defaultExpanded onAction={() => {}} />);
    expect(screen.getByRole("button", { name: "Turn into eval case" })).toBeInTheDocument();
  });

  it("shows the action for a dismissed finding", () => {
    const dismissed = { ...FINDING, dismissed_at: "2026-07-10T00:00:00Z" };
    renderWithIntl(<FindingCard f={dismissed} defaultExpanded onAction={() => {}} />);
    expect(screen.getByRole("button", { name: "Turn into eval case" })).toBeInTheDocument();
  });

  it("does not call the create mutation while a previous call is still pending (AC guard)", () => {
    mockCreateIsPending.current = true;
    const accepted = { ...FINDING, accepted_at: "2026-07-10T00:00:00Z" };
    renderWithIntl(<FindingCard f={accepted} defaultExpanded onAction={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Turn into eval case" }));
    expect(mockCreateMutate).not.toHaveBeenCalled();
  });

  it("AC-1: accepted finding opens the editor pre-filled with one must_find row and empty must_not_flag", () => {
    const accepted = { ...FINDING, accepted_at: "2026-07-10T00:00:00Z" };
    mockCreateMutate.mockImplementation((findingId, opts) => {
      expect(findingId).toBe(accepted.id);
      opts?.onSuccess?.(acceptedEvalCase(accepted));
    });
    renderWithIntl(<FindingCard f={accepted} defaultExpanded onAction={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Turn into eval case" }));

    expect(screen.getByText("Edit eval case")).toBeInTheDocument();
    const jsonBox = screen.getByDisplayValue(/must_find/, { normalizer: (s) => s }) as HTMLTextAreaElement;
    const parsed = JSON.parse(jsonBox.value);
    expect(parsed.must_find).toHaveLength(1);
    expect(parsed.must_find[0]).toMatchObject({
      file: accepted.file,
      start_line: accepted.start_line,
      end_line: accepted.end_line,
      severity: accepted.severity,
      category: accepted.category,
      title: accepted.title,
    });
    expect(parsed.must_not_flag).toEqual([]);
  });

  it("AC-2: dismissed finding opens the editor pre-filled with one must_not_flag region and empty must_find", () => {
    const dismissed = { ...FINDING, dismissed_at: "2026-07-10T00:00:00Z" };
    mockCreateMutate.mockImplementation((findingId, opts) => {
      expect(findingId).toBe(dismissed.id);
      opts?.onSuccess?.(dismissedEvalCase(dismissed));
    });
    renderWithIntl(<FindingCard f={dismissed} defaultExpanded onAction={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Turn into eval case" }));

    expect(screen.getByText("Edit eval case")).toBeInTheDocument();
    const jsonBox = screen.getByDisplayValue(/must_not_flag/, { normalizer: (s) => s }) as HTMLTextAreaElement;
    const parsed = JSON.parse(jsonBox.value);
    expect(parsed.must_find).toEqual([]);
    expect(parsed.must_not_flag).toHaveLength(1);
    expect(parsed.must_not_flag[0]).toMatchObject({
      file: dismissed.file,
      start_line: dismissed.start_line,
      end_line: dismissed.end_line,
    });
  });

  it("a re-click after closing opens the same case the server de-duped (source_finding_id round-trips)", () => {
    const accepted = { ...FINDING, accepted_at: "2026-07-10T00:00:00Z" };
    const existing = acceptedEvalCase(accepted);
    mockCreateMutate.mockImplementation((findingId, opts) => {
      expect(findingId).toBe(accepted.id);
      opts?.onSuccess?.(existing);
    });
    renderWithIntl(<FindingCard f={accepted} defaultExpanded onAction={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Turn into eval case" }));
    expect(screen.getByText(existing.name)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByText("Edit eval case")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Turn into eval case" }));
    expect(mockCreateMutate).toHaveBeenCalledTimes(2);
    expect(screen.getByText(existing.name)).toBeInTheDocument();
  });
});
