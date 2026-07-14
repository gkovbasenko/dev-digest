import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { CiRun } from "@devdigest/shared";
import messages from "../../../../../messages/en/ci.json";

// Stable (module-scoped) refs so a hook mock never returns a fresh literal per
// render (client INSIGHTS 2026-07-01 — a fresh reference can loop/OOM a worker).
const { mockRuns, mockRefresh } = vi.hoisted(() => ({
  mockRuns: { current: { data: undefined as CiRun[] | undefined } },
  mockRefresh: { mutate: vi.fn(), isPending: false },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/hooks/ci", () => ({
  useCiRuns: () => mockRuns.current,
  useRefreshCiRuns: () => mockRefresh,
}));

import { CiRunsView } from "./CiRunsView";

afterEach(() => {
  cleanup();
  mockRuns.current = { data: undefined };
  mockRefresh.mutate.mockReset();
});

const RUN_1: CiRun = {
  id: "r1",
  ci_installation_id: "i1",
  pr_number: 42,
  ran_at: "2026-07-13T10:00:00.000Z",
  status: "succeeded",
  findings_count: 3,
  cost_usd: 0.04,
  github_url: "https://github.com/acme/payments-api/actions/runs/1",
  source: "1",
  agent: "Security Reviewer",
  duration_s: 12,
};
const RUN_2: CiRun = {
  id: "r2",
  ci_installation_id: "i2",
  pr_number: 7,
  ran_at: "2026-07-13T09:00:00.000Z",
  status: "no_findings",
  findings_count: 0,
  cost_usd: null,
  github_url: "https://github.com/acme/billing-worker/actions/runs/2",
  source: "1",
  agent: "Perf Agent",
  duration_s: null,
};

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ ci: messages }}>
      <CiRunsView />
    </NextIntlClientProvider>,
  );
}

describe("CiRunsView (AC-25/26/27)", () => {
  it("renders one row per ingested run with PR, repo, agent, status, cost, duration and a job link", () => {
    mockRuns.current = { data: [RUN_1] };
    renderView();

    expect(screen.getByText("#42")).toBeInTheDocument();
    expect(screen.getByText("acme/payments-api")).toBeInTheDocument(); // repo derived from github_url
    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
    expect(screen.getByText("Succeeded")).toBeInTheDocument();
    expect(screen.getByText("$0.04")).toBeInTheDocument();
    expect(screen.getByText("12s")).toBeInTheDocument();

    const jobLink = screen.getByRole("link", { name: "View" });
    expect(jobLink).toHaveAttribute("href", RUN_1.github_url);
  });

  it("shows the empty-state CTA (not a zeroed table) when no runs are ingested", () => {
    mockRuns.current = { data: [] };
    renderView();

    expect(screen.getByText("No CI runs yet")).toBeInTheDocument();
    expect(screen.getByText("Add to CI")).toBeInTheDocument();
    expect(screen.queryByText("#42")).not.toBeInTheDocument();
  });

  it("renders an em-dash for null cost and null duration", () => {
    mockRuns.current = { data: [RUN_2] };
    renderView();

    // RUN_2 has null cost_usd AND null duration_s → two em-dash cells.
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("No findings")).toBeInTheDocument();
  });

  it("triggers a pull-ingest refresh when the Refresh button is clicked", () => {
    mockRuns.current = { data: [RUN_1] };
    renderView();

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(mockRefresh.mutate).toHaveBeenCalledTimes(1);
  });
});
