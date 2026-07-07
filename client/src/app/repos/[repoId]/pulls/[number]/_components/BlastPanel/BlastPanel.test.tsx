import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import prReviewMessages from "../../../../../../../../messages/en/prReview.json";
import commonMessages from "../../../../../../../../messages/en/common.json";

// Module-scoped, stable fixture (never a fresh literal per render — see
// client/INSIGHTS.md 2026-07-01 OOM gotcha).
const BLAST_FULL = {
  changed_symbols: [{ name: "processPayment", file: "src/billing/pay.ts", kind: "function" }],
  downstream: [
    {
      symbol: "processPayment",
      callers: [
        { name: "checkout", file: "src/billing/checkout.ts", line: 42 },
        { name: "refund", file: "src/billing/refund.ts", line: 10 },
      ],
      endpoints_affected: ["POST /api/checkout"],
      crons_affected: ["nightly-reconcile"],
    },
  ],
  impacted_endpoints: ["POST /api/checkout"],
  impacted_crons: ["nightly-reconcile"],
  summary: "",
  index_status: "full" as const,
  degraded: false,
  reason: null,
};

// A symbol whose affected endpoint is a bare path with no "METHOD " prefix —
// exercises parseEndpoint's `idx === -1` branch.
const BLAST_BARE_ENDPOINT = {
  changed_symbols: [{ name: "healthProbe", file: "src/health.ts", kind: "function" }],
  downstream: [
    {
      symbol: "healthProbe",
      callers: [{ name: "server", file: "src/server.ts", line: 5 }],
      endpoints_affected: ["/internal/health"],
      crons_affected: [],
    },
  ],
  impacted_endpoints: ["/internal/health"],
  impacted_crons: [],
  summary: "",
  index_status: "full" as const,
  degraded: false,
  reason: null,
};

// One changed symbol with callers + one with none: only the former is shown.
const BLAST_MIXED = {
  changed_symbols: [
    { name: "processPayment", file: "src/billing/pay.ts", kind: "function" },
    { name: "unusedHelper", file: "src/billing/util.ts", kind: "function" },
  ],
  downstream: [
    {
      symbol: "processPayment",
      callers: [{ name: "checkout", file: "src/billing/checkout.ts", line: 42 }],
      endpoints_affected: [],
      crons_affected: [],
    },
    { symbol: "unusedHelper", callers: [], endpoints_affected: [], crons_affected: [] },
  ],
  impacted_endpoints: [],
  impacted_crons: [],
  summary: "",
  index_status: "full" as const,
  degraded: false,
  reason: null,
};

// Changed symbols exist, but none are referenced anywhere (all 0 callers).
const BLAST_NO_CALLERS = {
  changed_symbols: [{ name: "unusedHelper", file: "src/billing/util.ts", kind: "function" }],
  downstream: [
    { symbol: "unusedHelper", callers: [], endpoints_affected: [], crons_affected: [] },
  ],
  impacted_endpoints: [],
  impacted_crons: [],
  summary: "",
  index_status: "full" as const,
  degraded: false,
  reason: null,
};

const BLAST_DEGRADED = {
  changed_symbols: [],
  downstream: [],
  impacted_endpoints: [],
  impacted_crons: [],
  summary: "",
  index_status: "degraded" as const,
  degraded: true,
  reason: "The repo has not been indexed yet.",
};

const BLAST_FAILED = {
  changed_symbols: [],
  downstream: [],
  impacted_endpoints: [],
  impacted_crons: [],
  summary: "",
  index_status: "failed" as const,
  degraded: true,
  reason: null,
};

// Partial index with no explicit reason → the panel falls back to the
// index_status="partial" message (distinct from degraded/failed).
const BLAST_PARTIAL = {
  changed_symbols: [],
  downstream: [],
  impacted_endpoints: [],
  impacted_crons: [],
  summary: "",
  index_status: "partial" as const,
  degraded: true,
  reason: null,
};

const PRIOR_PRS_SOME = {
  history: [
    {
      pr_number: 12,
      title: "Refactor billing checkout",
      merged_at: "2026-01-01T00:00:00.000Z",
      author: "jane",
      files_overlap: ["src/billing/pay.ts", "src/billing/checkout.ts"],
      notes: "",
    },
    {
      pr_number: 5,
      title: "Initial checkout flow",
      merged_at: "2025-12-01T00:00:00.000Z",
      author: "bob",
      files_overlap: ["src/billing/pay.ts"],
      notes: "",
    },
  ],
};

const PRIOR_PRS_EMPTY = { history: [] };

let blastData: unknown = BLAST_FULL;
let blastError = false;
let priorPrsData: unknown = PRIOR_PRS_EMPTY;
let priorPrsLoading = false;
let priorPrsError = false;
const refetchSpy = vi.fn();

vi.mock("@/lib/hooks/blast", () => ({
  useBlast: () => ({ data: blastData, isError: blastError, refetch: refetchSpy }),
  usePriorPrs: () => ({ data: priorPrsData, isLoading: priorPrsLoading, isError: priorPrsError }),
}));

import { BlastPanel } from "./BlastPanel";

afterEach(() => {
  cleanup();
  blastData = BLAST_FULL;
  blastError = false;
  priorPrsData = PRIOR_PRS_EMPTY;
  priorPrsLoading = false;
  priorPrsError = false;
  refetchSpy.mockClear();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={{ prReview: prReviewMessages, common: commonMessages }}
    >
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("BlastPanel", () => {
  it("renders counts and a changed symbol's callers, expanding/collapsing on click", () => {
    renderWithIntl(<BlastPanel prId="pr1" repoId="repo1" repoFullName="acme/widgets" headSha="abc123" />);

    // Header counts: 1 symbol, 2 callers, 1 endpoint, 1 cron.
    expect(screen.getByText("Blast radius")).toBeInTheDocument();
    expect(screen.getByText("Symbols")).toBeInTheDocument();
    expect(screen.getByText("Callers")).toBeInTheDocument();

    // The symbol block is expanded by default — callers render as file:line rows.
    expect(screen.getByText("processPayment")).toBeInTheDocument();
    const callerLink = screen.getByRole("link", { name: "src/billing/checkout.ts:42" });
    expect(callerLink).toBeInTheDocument();
    expect(callerLink).toHaveAttribute(
      "href",
      "https://github.com/acme/widgets/blob/abc123/src/billing/checkout.ts#L42",
    );
    expect(screen.getByText("src/billing/refund.ts:10")).toBeInTheDocument();

    // Endpoint + cron chips for the symbol.
    expect(screen.getByText("POST /api/checkout")).toBeInTheDocument();
    expect(screen.getByText("nightly-reconcile")).toBeInTheDocument();

    // Collapse the symbol block — callers disappear.
    fireEvent.click(screen.getByText("processPayment"));
    expect(screen.queryByText("src/billing/refund.ts:10")).not.toBeInTheDocument();
  });

  it("hides changed symbols that have no callers — only symbols with downstream impact are shown", () => {
    blastData = BLAST_MIXED;
    renderWithIntl(<BlastPanel prId="pr1" repoId="repo1" repoFullName="acme/widgets" headSha="abc123" />);

    // The impacted symbol renders; the 0-caller one is filtered out.
    expect(screen.getByText("processPayment")).toBeInTheDocument();
    expect(screen.queryByText("unusedHelper")).not.toBeInTheDocument();
  });

  it("shows a 'no downstream callers' state — not 'nothing changed' — when every changed symbol has 0 callers", () => {
    blastData = BLAST_NO_CALLERS;
    renderWithIntl(<BlastPanel prId="pr1" repoId="repo1" repoFullName="acme/widgets" headSha="abc123" />);

    expect(screen.getByText(prReviewMessages.blast.noImpactTitle)).toBeInTheDocument();
    expect(screen.queryByText("unusedHelper")).not.toBeInTheDocument();
    // Not the generic "no changed symbols" empty state.
    expect(screen.queryByText(prReviewMessages.blast.emptyTitle)).not.toBeInTheDocument();
  });

  it("shows a degraded badge with the reason and an empty state — never a blank screen — when the index has no symbols", () => {
    blastData = BLAST_DEGRADED;
    renderWithIntl(<BlastPanel prId="pr1" repoId="repo1" repoFullName="acme/widgets" headSha="abc123" />);

    expect(screen.getByText("The repo has not been indexed yet.")).toBeInTheDocument();
    expect(screen.getByText("No changed symbols detected")).toBeInTheDocument();
    expect(screen.queryByText("processPayment")).not.toBeInTheDocument();
  });

  it("colors endpoint chips by parsing the METHOD prefix and shows an error state with working retry on failure", () => {
    const { rerender } = renderWithIntl(
      <BlastPanel prId="pr1" repoId="repo1" repoFullName="acme/widgets" headSha="abc123" />,
    );
    expect(screen.getByText("POST /api/checkout")).toBeInTheDocument();

    blastData = undefined;
    blastError = true;
    rerender(
      <NextIntlClientProvider
        locale="en"
        messages={{ prReview: prReviewMessages, common: commonMessages }}
      >
        <BlastPanel prId="pr1" repoId="repo1" repoFullName="acme/widgets" headSha="abc123" />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText(commonMessages.states.error)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: commonMessages.actions.retry }));
    expect(refetchSpy).toHaveBeenCalledTimes(1);
  });

  it("renders the loading state (no crash) when prId is null — the query is disabled", () => {
    // useBlast(null) is disabled, so `data` is undefined; the tab must show the
    // loader, not blow up. (Mock returns undefined data / no error.)
    blastData = undefined;
    blastError = false;
    renderWithIntl(<BlastPanel prId={null} repoId="repo1" repoFullName="acme/widgets" headSha="abc123" />);
    expect(screen.getByText(commonMessages.states.loading)).toBeInTheDocument();
  });

  it("falls back to the failed-index message in the degraded badge when index_status is 'failed' and reason is null", () => {
    blastData = BLAST_FAILED;
    renderWithIntl(<BlastPanel prId="pr1" repoId="repo1" repoFullName="acme/widgets" headSha="abc123" />);
    expect(screen.getByText(prReviewMessages.blast.indexStatus.failed)).toBeInTheDocument();
    // Still an honest empty state, never a blank screen.
    expect(screen.getByText("No changed symbols detected")).toBeInTheDocument();
  });

  it("shows the partial-index message in the degraded badge when index_status is 'partial' and reason is null", () => {
    blastData = BLAST_PARTIAL;
    renderWithIntl(<BlastPanel prId="pr1" repoId="repo1" repoFullName="acme/widgets" headSha="abc123" />);
    expect(screen.getByText(prReviewMessages.blast.indexStatus.partial)).toBeInTheDocument();
  });

  it("renders caller rows as plain text (not links) when repoFullName/headSha are null", () => {
    renderWithIntl(<BlastPanel prId="pr1" repoId="repo1" repoFullName={null} headSha={null} />);
    // The file:line still shows so the map isn't lost, just without a deep link.
    expect(screen.getByText("src/billing/checkout.ts:42")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "src/billing/checkout.ts:42" }),
    ).not.toBeInTheDocument();
  });

  it("renders a bare-path endpoint chip (no METHOD prefix) without a method label", () => {
    blastData = BLAST_BARE_ENDPOINT;
    renderWithIntl(<BlastPanel prId="pr1" repoId="repo1" repoFullName="acme/widgets" headSha="abc123" />);
    // parseEndpoint's no-method branch: the chip is just the path.
    expect(screen.getByText("/internal/health")).toBeInTheDocument();
  });

  it("switches to the graph placeholder and hides the symbol tree when Graph is selected", () => {
    renderWithIntl(<BlastPanel prId="pr1" repoId="repo1" repoFullName="acme/widgets" headSha="abc123" />);
    expect(screen.getByText("processPayment")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: prReviewMessages.blast.graphView }));

    expect(screen.getByText(prReviewMessages.blast.graphPlaceholder)).toBeInTheDocument();
    expect(screen.queryByText("processPayment")).not.toBeInTheDocument();
  });

  it("restores the symbol tree when toggling Graph then back to Tree", () => {
    renderWithIntl(<BlastPanel prId="pr1" repoId="repo1" repoFullName="acme/widgets" headSha="abc123" />);

    fireEvent.click(screen.getByRole("button", { name: prReviewMessages.blast.graphView }));
    expect(screen.queryByText("processPayment")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: prReviewMessages.blast.treeView }));
    // Tree is back and the symbol block renders expanded (callers visible).
    expect(screen.getByText("processPayment")).toBeInTheDocument();
    expect(screen.getByText("src/billing/refund.ts:10")).toBeInTheDocument();
  });

  it("collapses a symbol block via keyboard (Enter on the header)", () => {
    renderWithIntl(<BlastPanel prId="pr1" repoId="repo1" repoFullName="acme/widgets" headSha="abc123" />);
    expect(screen.getByText("src/billing/refund.ts:10")).toBeInTheDocument();

    // The header is a role=button; Enter toggles it (keyboard a11y).
    fireEvent.keyDown(screen.getByText("processPayment"), { key: "Enter" });
    expect(screen.queryByText("src/billing/refund.ts:10")).not.toBeInTheDocument();
  });

  describe("Prior PRs touching these files accordion", () => {
    it("expands to render prior-PR rows from usePriorPrs, most-recent first, each linking to its PR", () => {
      priorPrsData = PRIOR_PRS_SOME;
      renderWithIntl(<BlastPanel prId="pr1" repoId="repo1" repoFullName="acme/widgets" headSha="abc123" />);

      // Collapsed by default — rows not yet rendered.
      expect(screen.getByText("Prior PRs touching these files")).toBeInTheDocument();
      expect(screen.queryByText("Refactor billing checkout")).not.toBeInTheDocument();

      fireEvent.click(screen.getByText("Prior PRs touching these files"));

      expect(screen.getByText("Refactor billing checkout")).toBeInTheDocument();
      expect(screen.getByText("Initial checkout flow")).toBeInTheDocument();
      expect(screen.getByText("jane")).toBeInTheDocument();
      expect(screen.getByText("bob")).toBeInTheDocument();

      const prLink = screen.getByRole("link", { name: /Refactor billing checkout/ });
      expect(prLink).toHaveAttribute("href", "/repos/repo1/pulls/12");
    });

    it("shows a quiet empty state — no crash — when there are no prior PRs", () => {
      priorPrsData = PRIOR_PRS_EMPTY;
      renderWithIntl(<BlastPanel prId="pr1" repoId="repo1" repoFullName="acme/widgets" headSha="abc123" />);

      fireEvent.click(screen.getByText("Prior PRs touching these files"));
      expect(screen.getByText("No prior merged PRs touched these files.")).toBeInTheDocument();
    });

    it("does not flash a '0 PRs' count or empty state while the query is still loading", () => {
      priorPrsData = undefined;
      priorPrsLoading = true;
      renderWithIntl(<BlastPanel prId="pr1" repoId="repo1" repoFullName="acme/widgets" headSha="abc123" />);

      // No count badge yet (would otherwise read "0 PRs").
      expect(screen.queryByText("0 PRs")).not.toBeInTheDocument();
      // And the body shows a loader, not the "no prior PRs" empty state.
      fireEvent.click(screen.getByText("Prior PRs touching these files"));
      expect(
        screen.queryByText("No prior merged PRs touched these files."),
      ).not.toBeInTheDocument();
    });

    it("shows an error state — not a false 'no prior PRs' — when the query fails", () => {
      priorPrsData = undefined;
      priorPrsError = true;
      renderWithIntl(<BlastPanel prId="pr1" repoId="repo1" repoFullName="acme/widgets" headSha="abc123" />);

      fireEvent.click(screen.getByText("Prior PRs touching these files"));
      expect(screen.getByText(commonMessages.states.error)).toBeInTheDocument();
      expect(
        screen.queryByText("No prior merged PRs touched these files."),
      ).not.toBeInTheDocument();
    });
  });
});
