import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, Severity } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { FindingsPanel } from "./FindingsPanel";

afterEach(cleanup);

function makeFinding(id: string, severity: Severity, title: string): FindingRecord {
  return {
    id,
    severity,
    category: "security",
    title,
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    rationale: "Some reason.",
    suggestion: null,
    confidence: 0.95,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  };
}

const FINDINGS: FindingRecord[] = [
  makeFinding("c1", "CRITICAL", "Hardcoded secret"),
  makeFinding("c2", "CRITICAL", "SQL injection"),
  makeFinding("w1", "WARNING", "Missing error handling"),
  makeFinding("s1", "SUGGESTION", "Rename helper"),
];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingsPanel (smoke)", () => {
  it("renders the toolbar + a finding card", () => {
    renderWithIntl(<FindingsPanel findings={[FINDINGS[0]!]} prId="pr1" />);
    expect(screen.getByText("Hide low confidence")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });
});

describe("FindingsPanel — severity counters", () => {
  function findChip(label: "CRITICAL" | "WARNING" | "SUGGESTION") {
    return screen.getByRole("button", { name: new RegExp(`\\b${label}\\b`) });
  }

  it("renders one counter per severity bucket with correct counts", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    const crit = findChip("CRITICAL");
    const warn = findChip("WARNING");
    const sugg = findChip("SUGGESTION");
    expect(within(crit).getByText("2")).toBeInTheDocument();
    expect(within(warn).getByText("1")).toBeInTheDocument();
    expect(within(sugg).getByText("1")).toBeInTheDocument();
  });

  it("filters findings to the clicked severity, and toggling off restores all", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);

    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("Missing error handling")).toBeInTheDocument();
    expect(screen.getByText("Rename helper")).toBeInTheDocument();

    fireEvent.click(findChip("CRITICAL"));
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("SQL injection")).toBeInTheDocument();
    expect(screen.queryByText("Missing error handling")).not.toBeInTheDocument();
    expect(screen.queryByText("Rename helper")).not.toBeInTheDocument();
    expect(findChip("CRITICAL")).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(findChip("CRITICAL"));
    expect(screen.getByText("Missing error handling")).toBeInTheDocument();
    expect(screen.getByText("Rename helper")).toBeInTheDocument();
    expect(findChip("CRITICAL")).toHaveAttribute("aria-pressed", "false");
  });

  it("disables a counter that has zero findings", () => {
    renderWithIntl(<FindingsPanel findings={[FINDINGS[0]!]} prId="pr1" />);
    expect(findChip("WARNING")).toBeDisabled();
    expect(findChip("SUGGESTION")).toBeDisabled();
    expect(findChip("CRITICAL")).not.toBeDisabled();
  });
});
