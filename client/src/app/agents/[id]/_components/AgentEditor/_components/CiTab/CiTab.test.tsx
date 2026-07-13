import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, CiInstallation, CiRun } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/ci.json";
import { ToastProvider } from "@/lib/toast";

// Stable module-scoped refs (client INSIGHTS 2026-07-01).
const { mockInstalls, mockRuns, mockRefresh, mockExport, mockUpdate } = vi.hoisted(() => ({
  mockInstalls: { current: { data: undefined as CiInstallation[] | undefined } },
  mockRuns: { current: { data: undefined as CiRun[] | undefined } },
  mockRefresh: { mutate: vi.fn(), isPending: false },
  mockExport: { mutate: vi.fn(), isPending: false, isError: false, isSuccess: false, data: undefined },
  mockUpdate: { mutate: vi.fn(), isPending: false },
}));

vi.mock("@/lib/hooks/ci", () => ({
  useCiInstallations: () => mockInstalls.current,
  useCiRuns: () => mockRuns.current,
  useRefreshCiRuns: () => mockRefresh,
  useExportCi: () => mockExport,
}));

vi.mock("@/lib/hooks/agents", () => ({
  useUpdateAgent: () => mockUpdate,
}));

import { CiTab } from "./CiTab";

afterEach(() => {
  cleanup();
  mockInstalls.current = { data: undefined };
  mockRuns.current = { data: undefined };
  mockRefresh.mutate.mockReset();
  mockUpdate.mutate.mockReset();
});

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

const INSTALL: CiInstallation = {
  id: "i1",
  agent_id: "ag1",
  repo: "acme/payments-api",
  target_type: "gha",
  installed_at: "2026-07-13T10:00:00.000Z",
};

const RUN: CiRun = {
  id: "r1",
  ci_installation_id: "i1",
  pr_number: 42,
  ran_at: "2026-07-13T10:00:00.000Z",
  status: "succeeded",
  findings_count: 3,
  cost_usd: 0.04,
  github_url: "https://github.com/acme/payments-api/actions/runs/1",
  source: "2",
  agent: "Security Reviewer",
  duration_s: 12,
};

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ ci: messages }}>
      <ToastProvider>
        <CiTab agent={AGENT} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("CiTab (AC-28/29/30, AC-7 entry)", () => {
  it("lists each installed repo with its target and latest run status/version (AC-28)", () => {
    mockInstalls.current = { data: [INSTALL] };
    mockRuns.current = { data: [RUN] };
    renderTab();

    expect(screen.getByText("acme/payments-api")).toBeInTheDocument();
    expect(screen.getByText("gha")).toBeInTheDocument();
    expect(screen.getByText("v2")).toBeInTheDocument(); // version from latest run's `source`
    // Both an install row and the run-history row carry "Succeeded".
    expect(screen.getAllByText("Succeeded").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("#42")).toBeInTheDocument(); // run history
  });

  it("persists a Fail-CI-on change via useUpdateAgent (AC-29/30)", () => {
    mockInstalls.current = { data: [INSTALL] };
    mockRuns.current = { data: [] };
    renderTab();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "warning" } });
    expect(mockUpdate.mutate).toHaveBeenCalledWith({ id: "ag1", patch: { ci_fail_on: "warning" } });
  });

  it("opens the Export Wizard when 'Add to CI' is clicked (AC-7)", () => {
    mockInstalls.current = { data: [INSTALL] };
    mockRuns.current = { data: [] };
    renderTab();

    expect(screen.queryByText("Export to CI")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add to CI" }));
    expect(screen.getByText("Export to CI")).toBeInTheDocument();
  });

  it("shows an empty state when the agent is not installed anywhere", () => {
    mockInstalls.current = { data: [] };
    mockRuns.current = { data: [] };
    renderTab();

    expect(screen.getByText("Not deployed to CI yet")).toBeInTheDocument();
  });
});
