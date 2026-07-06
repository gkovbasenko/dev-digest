import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";

const mutate = vi.fn();
let intentData: unknown = null;

vi.mock("@/lib/hooks/intent", () => ({
  useIntent: () => ({ data: intentData }),
  useRecomputeIntent: () => ({ mutate, isPending: false }),
}));

import { IntentCard } from "./IntentCard";

afterEach(() => {
  cleanup();
  mutate.mockClear();
  intentData = null;
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("IntentCard", () => {
  it("shows the empty state with a Compute intent button when no intent is stored", () => {
    intentData = null;
    renderWithIntl(<IntentCard prId="pr1" />);

    expect(screen.getByText("No intent computed yet")).toBeInTheDocument();
    const computeBtn = screen.getByRole("button", { name: "Compute intent" });
    expect(computeBtn).toBeInTheDocument();

    fireEvent.click(computeBtn);
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("renders the summary + scope lists and triggers recompute on click", () => {
    intentData = {
      intent: "Add dark mode support to settings.",
      in_scope: ["Theme toggle", "Settings persistence"],
      out_of_scope: ["Mobile app parity"],
      pr_id: "pr1",
    };
    renderWithIntl(<IntentCard prId="pr1" />);

    expect(screen.getByText("Summary")).toBeInTheDocument();
    expect(screen.getByText("Add dark mode support to settings.")).toBeInTheDocument();
    expect(screen.getByText("In scope")).toBeInTheDocument();
    expect(screen.getByText("Theme toggle")).toBeInTheDocument();
    expect(screen.getByText("Settings persistence")).toBeInTheDocument();
    expect(screen.getByText("Out of scope")).toBeInTheDocument();
    expect(screen.getByText("Mobile app parity")).toBeInTheDocument();

    const recomputeBtn = screen.getByRole("button", { name: "Recompute" });
    fireEvent.click(recomputeBtn);
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("renders the empty state without crashing when prId is nullish", () => {
    intentData = null; // useIntent is disabled (enabled: prId != null) → no data
    renderWithIntl(<IntentCard prId={undefined} />);

    expect(screen.getByText("No intent computed yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Compute intent" })).toBeInTheDocument();
  });

  it("omits the scope sections when in_scope / out_of_scope are empty", () => {
    intentData = {
      intent: "Fix a one-line typo in the README.",
      in_scope: [],
      out_of_scope: [],
      pr_id: "pr1",
    };
    renderWithIntl(<IntentCard prId="pr1" />);

    // Summary still renders...
    expect(screen.getByText("Summary")).toBeInTheDocument();
    expect(screen.getByText("Fix a one-line typo in the README.")).toBeInTheDocument();
    // ...but the empty scope sections are not rendered at all.
    expect(screen.queryByText("In scope")).not.toBeInTheDocument();
    expect(screen.queryByText("Out of scope")).not.toBeInTheDocument();
  });
});
