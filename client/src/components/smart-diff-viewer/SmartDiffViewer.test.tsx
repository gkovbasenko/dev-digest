import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import prReviewMessages from "../../../messages/en/prReview.json";
import commonMessages from "../../../messages/en/common.json";
import shellMessages from "../../../messages/en/shell.json";

// Module-scoped, stable fixtures (never a fresh literal per render — see
// client/INSIGHTS.md 2026-07-01 OOM gotcha).
const SMART_DIFF = {
  groups: [
    {
      role: "core" as const,
      files: [
        {
          path: "src/core/reviewer.ts",
          pseudocode_summary: null,
          additions: 3,
          deletions: 1,
          findings: [
            { start_line: 1, end_line: 1, severity: "WARNING" as const },
            { start_line: 2, end_line: 2, severity: "WARNING" as const },
          ],
        },
      ],
    },
    {
      role: "wiring" as const,
      files: [
        {
          path: "src/wiring/routes.ts",
          pseudocode_summary: null,
          additions: 1,
          deletions: 0,
          findings: [],
        },
      ],
    },
    {
      role: "boilerplate" as const,
      files: [
        {
          path: "pnpm-lock.yaml",
          pseudocode_summary: null,
          additions: 200,
          deletions: 5,
          findings: [],
        },
      ],
    },
  ],
  split_suggestion: { too_big: false, total_lines: 210, proposed_splits: [] },
};

const PULL_DETAIL = {
  files: [
    {
      path: "src/core/reviewer.ts",
      additions: 3,
      deletions: 1,
      patch: "@@ -1,2 +1,3 @@\n const a = 1;\n-const b = 2;\n+const b = 3;\n+const c = 4;",
    },
    {
      path: "src/wiring/routes.ts",
      additions: 1,
      deletions: 0,
      patch: "@@ -1,1 +1,2 @@\n const r = 1;\n+app.use(routes);",
    },
    {
      path: "pnpm-lock.yaml",
      additions: 200,
      deletions: 5,
      patch: "@@ -1,1 +1,2 @@\n lockfile\n+lockfile entry",
    },
  ],
  commits: [],
};

let smartDiffData: unknown = SMART_DIFF;
let pullDetailData: unknown = PULL_DETAIL;
// jsdom doesn't implement scrollIntoView (so this is `undefined` by default);
// capture it and restore in afterEach so a test's stub never leaks to others.
const originalScrollIntoView = Element.prototype.scrollIntoView;

vi.mock("@/lib/hooks/smart-diff", () => ({
  useSmartDiff: () => ({ data: smartDiffData }),
}));
vi.mock("@/lib/hooks/core", () => ({
  usePullDetail: () => ({ data: pullDetailData }),
}));

import { SmartDiffViewer, severityAt } from "./SmartDiffViewer";

afterEach(() => {
  cleanup();
  smartDiffData = SMART_DIFF;
  pullDetailData = PULL_DETAIL;
  Element.prototype.scrollIntoView = originalScrollIntoView;
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={{ prReview: prReviewMessages, common: commonMessages, shell: shellMessages }}
    >
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("SmartDiffViewer", () => {
  it("renders groups in fixed order (core, wiring, boilerplate) with a boilerplate group collapsed by default", () => {
    renderWithIntl(<SmartDiffViewer prId="pr1" />);

    expect(screen.getByText("Core logic")).toBeInTheDocument();
    expect(screen.getByText("Wiring")).toBeInTheDocument();
    expect(screen.getByText("Boilerplate")).toBeInTheDocument();

    const html = document.body.textContent ?? "";
    const coreIdx = html.indexOf("Core logic");
    const wiringIdx = html.indexOf("Wiring");
    const boilerplateIdx = html.indexOf("Boilerplate");
    expect(coreIdx).toBeGreaterThan(-1);
    expect(coreIdx).toBeLessThan(wiringIdx);
    expect(wiringIdx).toBeLessThan(boilerplateIdx);

    // Core file is visible (its group starts open)...
    expect(screen.getByText("src/core/reviewer.ts")).toBeInTheDocument();
    // ...but the boilerplate file is not, since that group starts collapsed.
    expect(screen.queryByText("pnpm-lock.yaml")).not.toBeInTheDocument();
  });

  it("shows a findings badge sized by findings.length only on flagged files", () => {
    renderWithIntl(<SmartDiffViewer prId="pr1" />);

    expect(screen.getByText("2 findings")).toBeInTheDocument();
    // The wiring file has no findings — no badge for it.
    expect(screen.queryByText("0 findings")).not.toBeInTheDocument();
  });

  it("renders the loading fallback when the smart-diff query result is absent", () => {
    // The component gates purely on `!smartDiff` — it never reads isLoading — so
    // an undefined data result (initial load / cache miss) hits this branch.
    smartDiffData = undefined;
    renderWithIntl(<SmartDiffViewer prId="pr1" />);

    expect(screen.getByText(commonMessages.states.loading)).toBeInTheDocument();
    expect(screen.queryByText("Core logic")).not.toBeInTheDocument();
  });

  it("renders an empty state when the PR has no changed files", () => {
    smartDiffData = {
      groups: [],
      split_suggestion: { too_big: false, total_lines: 0, proposed_splits: [] },
    };
    renderWithIntl(<SmartDiffViewer prId="pr1" />);

    expect(screen.getByText(commonMessages.states.empty)).toBeInTheDocument();
  });

  it("opens a collapsed flagged file and scrolls to the exact finding line on badge click", () => {
    // Flagged file big enough to start COLLAPSED (additions+deletions above the
    // FileCard auto-expand threshold), so the click must both open it AND scroll
    // — and to the specific finding line, not just "somewhere".
    smartDiffData = {
      groups: [
        {
          role: "core" as const,
          files: [
            {
              path: "src/big.ts",
              pseudocode_summary: null,
              additions: 300,
              deletions: 0,
              findings: [{ start_line: 5, end_line: 5, severity: "CRITICAL" as const }],
            },
          ],
        },
      ],
      split_suggestion: { too_big: true, total_lines: 300, proposed_splits: [] },
    };
    pullDetailData = {
      files: [
        {
          path: "src/big.ts",
          additions: 300,
          deletions: 0,
          // new line 5 is "+e" → rendered by CodeLine with data-line="5".
          patch: "@@ -1,4 +1,6 @@\n a\n b\n c\n d\n+e\n+f",
        },
      ],
      commits: [],
    };

    // Capture the element scrollIntoView is invoked on (its `this`).
    let scrolledEl: Element | null = null;
    const scrollIntoView = vi.fn(function (this: Element) {
      scrolledEl = this;
    });
    Element.prototype.scrollIntoView = scrollIntoView;

    renderWithIntl(<SmartDiffViewer prId="pr1" />);

    // Starts collapsed: the target diff line isn't in the DOM yet.
    expect(document.querySelector('[data-line="5"]')).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "1 findings" }));

    // Opened (line now rendered) and scrolled to the *exact* finding line.
    expect(document.querySelector('[data-line="5"]')).not.toBeNull();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrolledEl).not.toBeNull();
    expect(scrolledEl!.getAttribute("data-line")).toBe("5");
  });
});

describe("severityAt", () => {
  const ranges = [
    { start: 1, end: 10, severity: "WARNING" as const },
    { start: 5, end: 6, severity: "CRITICAL" as const },
  ];

  it("returns undefined for a line outside every range", () => {
    expect(severityAt(ranges, 20)).toBeUndefined();
  });

  it("returns undefined when there are no ranges", () => {
    expect(severityAt(undefined, 5)).toBeUndefined();
    expect(severityAt([], 5)).toBeUndefined();
  });

  it("returns the severity of a single covering range", () => {
    expect(severityAt(ranges, 3)).toBe("WARNING");
  });

  it("returns the highest severity when ranges overlap on a line", () => {
    expect(severityAt(ranges, 5)).toBe("CRITICAL");
  });

  it("treats range bounds as inclusive at both ends", () => {
    const one = [{ start: 4, end: 8, severity: "SUGGESTION" as const }];
    expect(severityAt(one, 4)).toBe("SUGGESTION");
    expect(severityAt(one, 8)).toBe("SUGGESTION");
    expect(severityAt(one, 9)).toBeUndefined();
  });
});
