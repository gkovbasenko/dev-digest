import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Conflict } from "@devdigest/shared";
import messages from "../../../../../messages/en/runs.json";
import { WhereAgentsDisagree } from "./WhereAgentsDisagree";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ runs: messages }}>{ui}</NextIntlClientProvider>);
}

describe("WhereAgentsDisagree (AC-22, AC-28, AC-29, AC-30)", () => {
  it("AC-22: an empty conflicts list renders the empty state, not an error", () => {
    renderWithIntl(<WhereAgentsDisagree conflicts={[]} />);
    expect(screen.getByText("No conflicts — the agents agree on every flagged location.")).toBeInTheDocument();
  });

  it("AC-28: a 3-take conflict renders 3 agent cells, one 'did not flag'", () => {
    const conflicts: Conflict[] = [
      {
        file: "src/auth.ts",
        line: 42,
        title: "Missing auth check",
        takes: [
          { agent_id: "a1", persona: "Security Reviewer", verdict: "CRITICAL", note: "Anyone can call this route." },
          { agent_id: "a2", persona: "Perf Reviewer", verdict: "ignored", note: "Reviewed the pull request but did not flag this location." },
          { agent_id: "a3", persona: "Style Reviewer", verdict: "WARNING", note: "Worth a second look." },
        ],
      },
    ];
    renderWithIntl(<WhereAgentsDisagree conflicts={conflicts} />);

    expect(screen.getByText("src/auth.ts:42")).toBeInTheDocument();
    expect(screen.getByText("Missing auth check")).toBeInTheDocument();
    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
    expect(screen.getByText("Perf Reviewer")).toBeInTheDocument();
    expect(screen.getByText("Style Reviewer")).toBeInTheDocument();
    expect(screen.getByText("did not flag")).toBeInTheDocument();
    // SeverityBadge is rendered `compact` (icon-only, no text label) — assert
    // via the finding-derived note text each flagged take carries instead.
    expect(screen.getByText("Anyone can call this route.")).toBeInTheDocument();
    expect(screen.getByText("Worth a second look.")).toBeInTheDocument();
  });

  it("AC-30: a failed agent is absent from the cells entirely (server already excludes it)", () => {
    const conflicts: Conflict[] = [
      {
        file: "src/auth.ts",
        line: 42,
        title: "Missing auth check",
        takes: [
          { agent_id: "a1", persona: "Security Reviewer", verdict: "CRITICAL", note: "note" },
          { agent_id: "a2", persona: "Perf Reviewer", verdict: "ignored", note: "note" },
        ],
      },
    ];
    renderWithIntl(<WhereAgentsDisagree conflicts={conflicts} />);
    expect(screen.queryByText("Failed Agent")).not.toBeInTheDocument();
    expect(screen.getAllByRole("columnheader")).toHaveLength(3); // blank location header + 2 agents
  });

  it("AC-29: 'Show only conflicts' hides a unanimous row and keeps a divergent one", () => {
    const conflicts: Conflict[] = [
      {
        file: "src/a.ts",
        line: 1,
        title: "Divergent finding",
        takes: [
          { agent_id: "a1", persona: "Security Reviewer", verdict: "CRITICAL", note: "note" },
          { agent_id: "a2", persona: "Perf Reviewer", verdict: "ignored", note: "note" },
        ],
      },
      {
        file: "src/b.ts",
        line: 2,
        title: "Unanimous finding",
        takes: [
          { agent_id: "a1", persona: "Security Reviewer", verdict: "CRITICAL", note: "note" },
          { agent_id: "a2", persona: "Perf Reviewer", verdict: "CRITICAL", note: "note" },
        ],
      },
    ];
    renderWithIntl(<WhereAgentsDisagree conflicts={conflicts} />);

    // Before toggling, both rows are visible.
    expect(screen.getByText("Divergent finding")).toBeInTheDocument();
    expect(screen.getByText("Unanimous finding")).toBeInTheDocument();

    const toggle = screen.getByRole("switch", { name: "Show only conflicts" });
    fireEvent.click(toggle);

    expect(screen.getByText("Divergent finding")).toBeInTheDocument();
    expect(screen.queryByText("Unanimous finding")).not.toBeInTheDocument();
  });

  it("the toggle is keyboard-reachable (a native button) and labelled", () => {
    const conflicts: Conflict[] = [
      {
        file: "src/a.ts",
        line: 1,
        title: "T",
        takes: [{ agent_id: "a1", persona: "Security Reviewer", verdict: "ignored", note: "n" }],
      },
    ];
    renderWithIntl(<WhereAgentsDisagree conflicts={conflicts} />);
    const toggle = screen.getByRole("switch", { name: "Show only conflicts" });
    expect(toggle.tagName).toBe("BUTTON");
    expect(within(toggle.closest("label")!).getByText("Show only conflicts")).toBeInTheDocument();
  });
});
