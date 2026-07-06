import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";
import type { PrFile } from "@/lib/types";

let commentsData: unknown = [];
vi.mock("@/lib/hooks/reviews", () => ({
  usePrComments: () => ({ data: commentsData }),
  useCreatePrComment: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

// SmartDiffViewer/DiffViewer have their own (well-covered) tests — stub them
// here so this test only asserts DiffTab's own toggle wiring.
vi.mock("@/components/smart-diff-viewer", () => ({
  SmartDiffViewer: () => <div data-testid="smart-diff-viewer" />,
}));
vi.mock("@/components/diff-viewer", () => ({
  // Capture the files prop so a test can assert DiffTab passes it through
  // unchanged (a stub that ignores props would hide a wrong-array regression).
  DiffViewer: (props: { files: unknown }) => (
    <div data-testid="diff-viewer" data-files={JSON.stringify(props.files)} />
  ),
}));

import { DiffTab } from "./DiffTab";

afterEach(() => {
  cleanup();
  commentsData = [];
});

const FILES: PrFile[] = [{ path: "src/a.ts", additions: 1, deletions: 0, patch: null }];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("DiffTab", () => {
  it("defaults to Smart order and switches to Original order (and back) on toggle", () => {
    renderWithIntl(<DiffTab prId="pr1" filesCount={1} files={FILES} />);

    // Smart order is the default.
    expect(screen.getByTestId("smart-diff-viewer")).toBeInTheDocument();
    expect(screen.queryByTestId("diff-viewer")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Original order" }));
    expect(screen.getByTestId("diff-viewer")).toBeInTheDocument();
    expect(screen.queryByTestId("smart-diff-viewer")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Smart order" }));
    expect(screen.getByTestId("smart-diff-viewer")).toBeInTheDocument();
    expect(screen.queryByTestId("diff-viewer")).not.toBeInTheDocument();
  });

  it("keeps the pre-existing comments toggle working within the new order-toggle layout", () => {
    commentsData = [{ id: "c1" }]; // one comment → the Show/Hide control appears
    renderWithIntl(<DiffTab prId="pr1" filesCount={1} files={FILES} canComment />);

    fireEvent.click(screen.getByRole("button", { name: /Show comments/ }));
    expect(screen.getByRole("button", { name: /Hide comments/ })).toBeInTheDocument();
  });

  it("shows no comments toggle when there are no comments (gated by count, not canComment)", () => {
    commentsData = []; // no comments — the Show/Hide control must be absent
    renderWithIntl(<DiffTab prId="pr1" filesCount={1} files={FILES} canComment />);

    expect(screen.queryByRole("button", { name: /comments/i })).not.toBeInTheDocument();
  });

  it("passes the files prop through to the Original-order DiffViewer unchanged", () => {
    renderWithIntl(<DiffTab prId="pr1" filesCount={1} files={FILES} />);

    fireEvent.click(screen.getByRole("button", { name: "Original order" }));
    const dv = screen.getByTestId("diff-viewer");
    expect(JSON.parse(dv.getAttribute("data-files")!)).toEqual(FILES);
  });
});
