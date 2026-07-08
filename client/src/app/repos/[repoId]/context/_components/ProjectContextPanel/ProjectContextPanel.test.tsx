import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ContextDocList, ContextDocPreview } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import messages from "../../../../../../../messages/en/context.json";

const {
  mockDocs,
  mockIsLoading,
  mockIsError,
  mockError,
  mockRefetch,
  mockPreview,
  mockPreviewLoading,
  mockPreviewError,
  mockPreviewRefetch,
} = vi.hoisted(() => ({
  mockDocs: { current: undefined as ContextDocList | undefined },
  mockIsLoading: { current: false },
  mockIsError: { current: false },
  mockError: { current: null as Error | null },
  mockRefetch: vi.fn(),
  mockPreview: { current: undefined as ContextDocPreview | undefined },
  mockPreviewLoading: { current: false },
  mockPreviewError: { current: false },
  mockPreviewRefetch: vi.fn(),
}));

vi.mock("@/lib/hooks/context", () => ({
  useContextDocs: () => ({
    data: mockDocs.current,
    isLoading: mockIsLoading.current,
    isError: mockIsError.current,
    error: mockError.current,
    refetch: mockRefetch,
  }),
  useContextFilePreview: () => ({
    data: mockPreview.current,
    isLoading: mockPreviewLoading.current,
    isError: mockPreviewError.current,
    error: mockPreviewError.current ? new Error("preview failed") : null,
    refetch: mockPreviewRefetch,
  }),
}));

import { ProjectContextPanel } from "./ProjectContextPanel";

afterEach(() => {
  cleanup();
  mockDocs.current = undefined;
  mockIsLoading.current = false;
  mockIsError.current = false;
  mockError.current = null;
  mockRefetch.mockReset();
  mockPreview.current = undefined;
  mockPreviewLoading.current = false;
  mockPreviewError.current = false;
  mockPreviewRefetch.mockReset();
});

function renderPanel() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <ProjectContextPanel repoId="repo1" />
    </NextIntlClientProvider>,
  );
}

const DOCS: ContextDocList = {
  indexed: true,
  documents: [
    { path: "specs/a.md", badge: "specs", token_count: 120 },
    { path: "docs/b.md", badge: "docs", token_count: 340 },
  ],
};

describe("ProjectContextPanel", () => {
  it("shows a not-indexed empty state (not an error) when the repo has no clone", () => {
    mockDocs.current = { indexed: false, documents: [] };
    renderPanel();
    expect(screen.getByText("Not indexed yet")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows an empty state when indexed but no docs were found", () => {
    mockDocs.current = { indexed: true, documents: [] };
    renderPanel();
    expect(screen.getByText("No project context docs found")).toBeInTheDocument();
  });

  it("lists each doc's path + badge + token count, and has no create/upload/edit/delete controls", () => {
    mockDocs.current = DOCS;
    renderPanel();
    expect(screen.getByText("specs/a.md")).toBeInTheDocument();
    expect(screen.getByText("docs/b.md")).toBeInTheDocument();
    expect(screen.getByText("specs")).toBeInTheDocument();
    expect(screen.getByText("docs")).toBeInTheDocument();
    expect(screen.getByText("≈120 tokens")).toBeInTheDocument();
    expect(screen.getByText("≈340 tokens")).toBeInTheDocument();

    for (const label of [/create/i, /upload/i, /edit/i, /delete/i, /reindex/i, /re-index/i]) {
      expect(screen.queryByRole("button", { name: label })).not.toBeInTheDocument();
    }
    expect(screen.getByText(/Indexed — 2 document/)).toBeInTheDocument();
  });

  it("clicking a row shows a read-only Markdown preview of that doc", () => {
    mockDocs.current = DOCS;
    mockPreview.current = { content: "# Rule A\n\nDo the thing." };
    renderPanel();

    fireEvent.click(screen.getByText("specs/a.md"));

    expect(screen.getByRole("heading", { name: "Rule A" })).toBeInTheDocument();
    expect(screen.getByText("Do the thing.")).toBeInTheDocument();
    // No textbox/editor in the preview — read-only.
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("shows an error state with retry on a fetch failure", () => {
    mockIsError.current = true;
    mockError.current = new ApiError("Repo not found", 404, "not_found");
    renderPanel();
    expect(screen.getByText("Repo not found")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Retry"));
    expect(mockRefetch).toHaveBeenCalledOnce();
  });
});
