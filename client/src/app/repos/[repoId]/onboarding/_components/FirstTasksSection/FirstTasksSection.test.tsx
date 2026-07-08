import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/onboarding.json";
import { FirstTasksSection } from "./FirstTasksSection";

afterEach(cleanup);

function renderSection(props: { body: string; links: Array<{ path: string; label: string }> }) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      <FirstTasksSection {...props} />
    </NextIntlClientProvider>,
  );
}

describe("FirstTasksSection", () => {
  it("shows an empty note when there is no body and no links", () => {
    renderSection({ body: "", links: [] });
    expect(screen.getByText("No first tasks suggested.")).toBeInTheDocument();
  });

  it("renders the body as a task list and any linked files below it", () => {
    renderSection({
      body: "1. Fix the failing lint rule.\n2. Add a test for the empty state.",
      links: [{ path: "src/lib/lint.ts", label: "The rule that's currently failing." }],
    });
    expect(screen.getByText(/Fix the failing lint rule\./)).toBeInTheDocument();
    expect(screen.getByText("src/lib/lint.ts")).toBeInTheDocument();
    expect(screen.getByText("The rule that's currently failing.")).toBeInTheDocument();
  });
});
