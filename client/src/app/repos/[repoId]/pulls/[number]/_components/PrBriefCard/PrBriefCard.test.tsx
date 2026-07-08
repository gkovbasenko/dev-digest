import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RiskBrief, BriefRead } from "@devdigest/shared";
import prReviewMessages from "../../../../../../../../messages/en/prReview.json";
import commonMessages from "../../../../../../../../messages/en/common.json";

const { mockData, mockIsError, mockRefetch, mockMutate, mockRegeneratePending, mockRegenerateError } =
  vi.hoisted(() => ({
    mockData: { current: undefined as BriefRead | undefined },
    mockIsError: { current: false },
    mockRefetch: vi.fn(),
    mockMutate: vi.fn(),
    mockRegeneratePending: { current: false },
    mockRegenerateError: { current: false },
  }));

vi.mock("@/lib/hooks/brief", () => ({
  useBrief: () => ({
    data: mockData.current,
    isError: mockIsError.current,
    refetch: mockRefetch,
  }),
  useRegenerateBrief: () => ({
    mutate: mockMutate,
    isPending: mockRegeneratePending.current,
    isError: mockRegenerateError.current,
  }),
}));

import { PrBriefCard } from "./PrBriefCard";

afterEach(() => {
  cleanup();
  mockData.current = undefined;
  mockIsError.current = false;
  mockRefetch.mockClear();
  mockMutate.mockClear();
  mockRegeneratePending.current = false;
  mockRegenerateError.current = false;
});

function renderCard(props: Partial<React.ComponentProps<typeof PrBriefCard>> = {}) {
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={{ prReview: prReviewMessages, common: commonMessages }}
    >
      <PrBriefCard prId="pr1" repoFullName="acme/widgets" headSha="abc123" {...props} />
    </NextIntlClientProvider>,
  );
}

function rerenderCard(rerender: (ui: React.ReactElement) => void, props: Partial<React.ComponentProps<typeof PrBriefCard>> = {}) {
  rerender(
    <NextIntlClientProvider
      locale="en"
      messages={{ prReview: prReviewMessages, common: commonMessages }}
    >
      <PrBriefCard prId="pr1" repoFullName="acme/widgets" headSha="abc123" {...props} />
    </NextIntlClientProvider>,
  );
}

// A long, sentence-length explanation — must render as wrapping text, never
// inside a (white-space: nowrap) Badge (client INSIGHTS 2026-07-07).
const LONG_EXPLANATION =
  "If the retry queue re-processes a payment before the gateway's idempotency window has elapsed, a customer could be charged twice for the same order.";

const BRIEF_FULL: RiskBrief = {
  what: "Adds a payment retry queue for transient gateway failures.",
  why: "Reduces failed-payment support tickets by retrying transient gateway errors automatically.",
  risk_level: "high",
  risks: [
    {
      kind: "correctness",
      title: "Retry loop may double-charge",
      explanation: LONG_EXPLANATION,
      severity: "high",
      file_refs: ["src/billing/retry-queue.ts"],
    },
    {
      kind: "test",
      title: "No test coverage for the new queue",
      explanation: "The retry queue module ships with zero unit tests.",
      severity: "low",
      file_refs: [],
    },
  ],
  review_focus: [
    { file: "src/billing/retry-queue.ts", line: 42, note: "Idempotency key derivation — read this first." },
    { file: "src/billing/gateway.ts", note: "Confirms the gateway's retry window assumption." },
  ],
};

const BRIEF_READ_EMPTY: BriefRead = { exists: false, stale: false, generated_at: null, brief: null };
const BRIEF_READ_EXISTS: BriefRead = {
  exists: true,
  stale: false,
  generated_at: "2026-07-08T12:00:00.000Z",
  brief: BRIEF_FULL,
};

describe("PrBriefCard", () => {
  it("shows the Generate empty state with no auto-fire on mount, and guards a second click while pending (AC-15, AC-16)", () => {
    mockData.current = BRIEF_READ_EMPTY;
    const { rerender } = renderCard();

    // No mutation fired just from mounting the card.
    expect(mockMutate).not.toHaveBeenCalled();
    expect(screen.getByText("No brief generated yet")).toBeInTheDocument();

    const generateBtn = screen.getByRole("button", { name: "Generate brief" });
    fireEvent.click(generateBtn);
    expect(mockMutate).toHaveBeenCalledTimes(1);

    // Simulate the mutation now being in flight — the button must disable and
    // a second click must not fire a second mutation.
    mockRegeneratePending.current = true;
    rerenderCard(rerender);
    const pendingBtn = screen.getByText("Generate brief").closest("button")!;
    expect(pendingBtn).toBeDisabled();
    fireEvent.click(pendingBtn);
    expect(mockMutate).toHaveBeenCalledTimes(1);
  });

  it("renders what/why, a color+labelled risk level, wrapping (non-Badge) explanations, and blob-URL links for file_refs/review_focus (AC-12, AC-13, AC-14)", () => {
    mockData.current = BRIEF_READ_EXISTS;
    renderCard();

    expect(screen.getByText(BRIEF_FULL.what)).toBeInTheDocument();
    expect(screen.getByText(BRIEF_FULL.why)).toBeInTheDocument();

    // risk_level: color token AND a visible text label — never color alone.
    const riskLevelLabel = screen.getByText("High risk");
    expect(riskLevelLabel).toBeInTheDocument();
    expect(riskLevelLabel.style.color).toBe("var(--crit)");

    // Per-risk severity: same color+label contract.
    const highSeverity = screen.getByText("High");
    expect(highSeverity.style.color).toBe("var(--crit)");
    const lowSeverity = screen.getByText("Low");
    expect(lowSeverity.style.color).toBe("var(--ok)");

    // The long explanation renders in a wrapping <p>, not a nowrap Badge.
    const explanationEl = screen.getByText(LONG_EXPLANATION);
    expect(explanationEl.tagName).toBe("P");
    expect(explanationEl.style.overflowWrap).toBe("anywhere");

    // file_refs → a real blob-URL anchor when repoFullName/headSha resolve.
    const fileRefLink = screen.getByRole("link", { name: "src/billing/retry-queue.ts" });
    expect(fileRefLink).toHaveAttribute(
      "href",
      "https://github.com/acme/widgets/blob/abc123/src/billing/retry-queue.ts",
    );

    // review_focus renders as an ORDERED list, each entry linking to its
    // file (with line, when present).
    const focusList = screen.getByRole("list");
    expect(focusList.tagName).toBe("OL");
    expect(screen.getByText("Idempotency key derivation — read this first.")).toBeInTheDocument();
    const focusLinkWithLine = screen.getByRole("link", { name: "src/billing/retry-queue.ts:42" });
    expect(focusLinkWithLine).toHaveAttribute(
      "href",
      "https://github.com/acme/widgets/blob/abc123/src/billing/retry-queue.ts#L42",
    );
    const focusLinkNoLine = screen.getByRole("link", { name: "src/billing/gateway.ts" });
    expect(focusLinkNoLine).toHaveAttribute(
      "href",
      "https://github.com/acme/widgets/blob/abc123/src/billing/gateway.ts",
    );
  });

  it("renders file_refs/review_focus as plain text (not links) when repoFullName/headSha are unresolvable (AC-13)", () => {
    mockData.current = BRIEF_READ_EXISTS;
    renderCard({ repoFullName: null, headSha: null });

    expect(screen.getByText("src/billing/retry-queue.ts")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "src/billing/retry-queue.ts" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("src/billing/retry-queue.ts:42")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "src/billing/retry-queue.ts:42" }),
    ).not.toBeInTheDocument();
  });

  it("shows a non-blocking stale hint without hiding the cached brief (AC-16)", () => {
    mockData.current = { ...BRIEF_READ_EXISTS, stale: true };
    renderCard();

    expect(screen.getByText(/New commits since this brief/)).toBeInTheDocument();
    // The cached content still renders in full underneath the hint.
    expect(screen.getByText(BRIEF_FULL.what)).toBeInTheDocument();
  });

  it("guards Regenerate against a second click while pending, then swaps in fresh content once it resolves (AC-15)", () => {
    mockData.current = BRIEF_READ_EXISTS;
    const { rerender } = renderCard();

    const regenerateBtn = screen.getByRole("button", { name: "Regenerate" });
    fireEvent.click(regenerateBtn);
    expect(mockMutate).toHaveBeenCalledTimes(1);

    mockRegeneratePending.current = true;
    rerenderCard(rerender);
    const pendingRegenerateBtn = screen.getByText("Regenerate").closest("button")!;
    expect(pendingRegenerateBtn).toBeDisabled();
    fireEvent.click(pendingRegenerateBtn);
    expect(mockMutate).toHaveBeenCalledTimes(1);

    // The mutation resolves: the query hook now returns fresh data.
    mockRegeneratePending.current = false;
    mockData.current = {
      exists: true,
      stale: false,
      generated_at: "2026-07-08T13:00:00.000Z",
      brief: { ...BRIEF_FULL, what: "Adds a payment retry queue AND a circuit breaker." },
    };
    rerenderCard(rerender);
    expect(screen.getByText("Adds a payment retry queue AND a circuit breaker.")).toBeInTheDocument();
    expect(screen.queryByText(BRIEF_FULL.what)).not.toBeInTheDocument();
  });

  it("keeps the prior brief on screen and shows an inline retry when a regenerate fails (AC-15)", () => {
    mockData.current = BRIEF_READ_EXISTS;
    mockRegenerateError.current = true;
    renderCard();

    // The prior brief is still fully rendered — a failed regenerate must not
    // clear it (the global toast, wired in providers.tsx, handles the error).
    expect(screen.getByText(BRIEF_FULL.what)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mockMutate).toHaveBeenCalledTimes(1);
  });
});
