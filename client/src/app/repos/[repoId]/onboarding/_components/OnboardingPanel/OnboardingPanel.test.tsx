import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { OnboardingDoc } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { ToastProvider } from "@/lib/toast";
import messages from "../../../../../../../messages/en/onboarding.json";

const { mockDoc, mockIsLoading, mockIsError, mockError, mockRefetch, mockMutate, mockRegeneratePending, mockRegenerateError } =
  vi.hoisted(() => ({
    mockDoc: { current: undefined as OnboardingDoc | undefined },
    mockIsLoading: { current: false },
    mockIsError: { current: false },
    mockError: { current: null as Error | null },
    mockRefetch: vi.fn(),
    mockMutate: vi.fn(),
    mockRegeneratePending: { current: false },
    mockRegenerateError: { current: false },
  }));

vi.mock("@/lib/hooks/onboarding", () => ({
  useOnboarding: () => ({
    data: mockDoc.current,
    isLoading: mockIsLoading.current,
    isError: mockIsError.current,
    error: mockError.current,
    refetch: mockRefetch,
  }),
  useRegenerateOnboarding: () => ({
    mutate: mockMutate,
    isPending: mockRegeneratePending.current,
    isError: mockRegenerateError.current,
  }),
}));

vi.mock("@/components/mermaid-diagram", () => ({
  MermaidDiagram: ({ chart }: { chart: string }) => <div data-testid="mermaid-diagram" data-chart={chart} />,
}));

import { OnboardingPanel } from "./OnboardingPanel";

afterEach(() => {
  cleanup();
  mockDoc.current = undefined;
  mockIsLoading.current = false;
  mockIsError.current = false;
  mockError.current = null;
  mockRefetch.mockReset();
  mockMutate.mockReset();
  mockRegeneratePending.current = false;
  mockRegenerateError.current = false;
});

function renderPanel() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      <ToastProvider>
        <OnboardingPanel
          repoId="repo1"
          repoName="acme/payments-api"
          repoFullName="acme/payments-api"
          defaultBranch="main"
        />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

const FULL_DOC: OnboardingDoc = {
  exists: true,
  indexed: true,
  stale: false,
  generated_at: new Date().toISOString(),
  source_file_count: 37,
  sections: [
    {
      kind: "architecture",
      title: "System Architecture",
      body: "Three layers: client, server, DB.",
      diagram: "flowchart TD\nA-->B",
      links: [],
    },
    {
      kind: "critical_paths",
      title: "Critical Paths",
      body: "",
      diagram: null,
      links: [{ path: "src/modules/webhooks/routes.ts", label: "All inbound webhooks are authenticated here." }],
    },
    {
      kind: "how_to_run",
      title: "How To Run",
      body: "```bash\npnpm dev\n```",
      diagram: null,
      links: [],
    },
    {
      kind: "guided_reading",
      title: "Guided Reading",
      body: "",
      diagram: null,
      links: [{ path: "src/server.ts", label: "Start here." }],
    },
    {
      kind: "first_tasks",
      title: "First Tasks",
      body: "1. Fix a typo.",
      diagram: null,
      links: [],
    },
  ],
};

describe("OnboardingPanel", () => {
  it("shows loading skeletons while the doc is loading", () => {
    mockIsLoading.current = true;
    const { container } = renderPanel();
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
  });

  it("shows an error state with retry on a fetch failure (AC-21)", () => {
    mockIsError.current = true;
    mockError.current = new ApiError("Repo not found", 404, "not_found");
    renderPanel();
    expect(screen.getByText("Repo not found")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Retry"));
    expect(mockRefetch).toHaveBeenCalledOnce();
  });

  it("shows an 'index this repo first' empty state with no Generate button when not indexed (AC-13)", () => {
    mockDoc.current = { exists: false, indexed: false, stale: false, generated_at: null, source_file_count: 0, sections: [] };
    renderPanel();
    expect(screen.getByText("Index this repo first")).toBeInTheDocument();
    expect(screen.queryByText("Generate onboarding tour")).not.toBeInTheDocument();
  });

  it("shows a Generate button when indexed but not yet generated, and guards it against a second click while pending (AC-14)", () => {
    mockDoc.current = { exists: false, indexed: true, stale: false, generated_at: null, source_file_count: 12, sections: [] };
    const { rerender } = renderPanel();
    const cta = screen.getByRole("button", { name: "Generate onboarding tour" });
    fireEvent.click(cta);
    expect(mockMutate).toHaveBeenCalledTimes(1);

    mockRegeneratePending.current = true;
    rerender(
      <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
        <ToastProvider>
          <OnboardingPanel
            repoId="repo1"
            repoName="acme/payments-api"
            repoFullName="acme/payments-api"
            defaultBranch="main"
          />
        </ToastProvider>
      </NextIntlClientProvider>,
    );
    const pendingCta = screen.getByText("Generating…").closest("button")!;
    expect(pendingCta).toBeDisabled();
    fireEvent.click(pendingCta);
    // disabled DOM buttons don't fire click handlers — still just the one call.
    expect(mockMutate).toHaveBeenCalledTimes(1);
  });

  it("renders the full tour: header, on-this-page nav, and five collapsible section cards (AC-15)", () => {
    mockDoc.current = FULL_DOC;
    renderPanel();

    expect(screen.getByText("Onboarding for acme/payments-api")).toBeInTheDocument();
    expect(screen.getByText(/Generated from index of 37 files/)).toBeInTheDocument();

    const nav = screen.getByRole("navigation", { name: "On this page" });
    for (const label of ["Architecture", "Critical paths", "How to run", "Guided reading", "First tasks"]) {
      expect(nav).toHaveTextContent(label);
    }

    // Five section cards render (by their LLM-generated titles), first open by default.
    expect(screen.getByText("Three layers: client, server, DB.")).toBeInTheDocument();
    expect(screen.queryByText("pnpm dev")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("How To Run"));
    expect(screen.getByText("pnpm dev")).toBeInTheDocument();
  });

  it("shows a non-blocking stale hint while still rendering cached content (AC-20)", () => {
    mockDoc.current = { ...FULL_DOC, stale: true };
    renderPanel();
    expect(screen.getByText(/may be out of date/)).toBeInTheDocument();
    expect(screen.getByText("Onboarding for acme/payments-api")).toBeInTheDocument();
  });

  it("keeps rendering the prior content and shows an inline retry when a regenerate fails, never blanking the page (AC-21)", () => {
    mockDoc.current = FULL_DOC;
    mockRegenerateError.current = true;
    renderPanel();
    expect(screen.getByText("Onboarding for acme/payments-api")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Retry"));
    expect(mockMutate).toHaveBeenCalledTimes(1);
  });
});
