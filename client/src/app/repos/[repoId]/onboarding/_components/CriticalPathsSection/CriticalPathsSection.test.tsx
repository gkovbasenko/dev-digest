import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { OnboardingLink } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/onboarding.json";
import { CriticalPathsSection } from "./CriticalPathsSection";

afterEach(cleanup);

function renderSection(props: {
  links: OnboardingLink[];
  repoFullName?: string | null;
  defaultBranch?: string | null;
}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      <CriticalPathsSection {...props} />
    </NextIntlClientProvider>,
  );
}

const LINK: OnboardingLink = {
  label: "This is where every incoming webhook request is authenticated and routed.",
  path: "src/modules/webhooks/routes.ts",
};

describe("CriticalPathsSection", () => {
  it("shows an empty note when there are no critical paths", () => {
    renderSection({ links: [] });
    expect(screen.getByText("No critical paths identified.")).toBeInTheDocument();
  });

  it("renders the path and the 'why it matters' text as wrapping text, not a Badge", () => {
    renderSection({ links: [LINK] });
    expect(screen.getByText(LINK.path)).toBeInTheDocument();
    const why = screen.getByText(LINK.label);
    expect(why).toBeInTheDocument();
    expect(why.tagName).toBe("P");
    expect(why.style.overflowWrap).toBe("anywhere");
    expect(why.style.whiteSpace).not.toBe("nowrap");
  });

  it("renders an Open link to the GitHub blob at the default branch when repo info is available", () => {
    renderSection({ links: [LINK], repoFullName: "acme/payments-api", defaultBranch: "main" });
    const open = screen.getByText("Open").closest("a");
    expect(open).toBeInTheDocument();
    expect(open).toHaveAttribute(
      "href",
      "https://github.com/acme/payments-api/blob/main/src/modules/webhooks/routes.ts",
    );
    expect(open).toHaveAttribute("target", "_blank");
  });

  it("omits the Open action when repoFullName/defaultBranch are unavailable", () => {
    renderSection({ links: [LINK] });
    expect(screen.queryByText("Open")).not.toBeInTheDocument();
  });
});
