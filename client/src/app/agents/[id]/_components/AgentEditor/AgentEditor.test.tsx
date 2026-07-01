import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../messages/en/agents.json";
import { ToastProvider } from "../../../../../lib/toast";

// Mock the data hooks so the editor renders without a network/query client.
vi.mock("../../../../../lib/hooks/agents", () => ({
  useUpdateAgent: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, data: undefined }),
  useProviderModels: () => ({ data: [{ id: "gpt-4.1", provider: "openai" }] }),
}));

// Stable (module-scoped) empty arrays: SkillsTab has a useEffect keyed on the
// useAgentSkills() result's referential identity (as the real TanStack Query
// hook returns a stable reference across renders once settled). Returning a
// fresh `[]` literal per call here breaks that assumption and causes an
// infinite effect → setState → re-render loop (OOMs the test worker). Must use
// vi.hoisted() since vi.mock() factories are hoisted above plain top-level
// `const` declarations.
const { EMPTY_SKILLS, EMPTY_AGENT_SKILLS } = vi.hoisted(() => ({
  EMPTY_SKILLS: [] as never[],
  EMPTY_AGENT_SKILLS: [] as never[],
}));

vi.mock("../../../../../lib/hooks/skills", () => ({
  useSkills: () => ({ data: EMPTY_SKILLS }),
  useAgentSkills: () => ({ data: EMPTY_AGENT_SKILLS }),
  useSetAgentSkills: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { AgentEditor } from "./AgentEditor";

afterEach(cleanup);

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

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("A2 Agent Editor (smoke)", () => {
  it("renders the Config tab fields", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    expect(screen.getByText("Config")).toBeInTheDocument();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Save agent")).toBeInTheDocument();
  });

  it("renders both Config and Skills tab labels", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    expect(screen.getByText("Config")).toBeInTheDocument();
    expect(screen.getByText("Skills")).toBeInTheDocument();
  });

  it("shows the Skills tab content when tab=skills", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="skills" onTab={() => {}} />);
    // Header rendered by SkillsTab (the tab bar also has a "Skills" label, so
    // disambiguate via role — plain getByText("Skills") matches both).
    expect(screen.getByRole("heading", { name: "Skills" })).toBeInTheDocument();
    // Filter input is present
    expect(screen.getByPlaceholderText("Filter skills…")).toBeInTheDocument();
    // Config tab fields are NOT rendered
    expect(screen.queryByText("Configuration")).not.toBeInTheDocument();
  });

  it("does not render SkillsTab content when on config tab", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    expect(screen.queryByPlaceholderText("Filter skills…")).not.toBeInTheDocument();
  });
});
