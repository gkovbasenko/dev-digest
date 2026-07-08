import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { OnboardingLink } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/onboarding.json";
import { GuidedReadingSection } from "./GuidedReadingSection";

afterEach(cleanup);

function renderSection(links: OnboardingLink[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      <GuidedReadingSection links={links} />
    </NextIntlClientProvider>,
  );
}

describe("GuidedReadingSection", () => {
  it("shows an empty note when there are no suggested links", () => {
    renderSection([]);
    expect(screen.getByText("No guided reading suggested.")).toBeInTheDocument();
  });

  it("renders an ordered list of paths with their rationale as wrapping text", () => {
    renderSection([
      { path: "src/server.ts", label: "Start here: this wires up the whole app." },
      { path: "src/modules/reviews/service.ts", label: "The core review orchestration logic." },
    ]);
    const list = screen.getByRole("list");
    expect(list.tagName).toBe("OL");
    expect(screen.getByText("src/server.ts")).toBeInTheDocument();
    const rationale = screen.getByText("Start here: this wires up the whole app.");
    expect(rationale.tagName).toBe("P");
    expect(rationale.style.overflowWrap).toBe("anywhere");
    expect(screen.getByText("src/modules/reviews/service.ts")).toBeInTheDocument();
  });
});
