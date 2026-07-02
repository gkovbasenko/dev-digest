import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { Agent, AgentSkillLink } from "@devdigest/shared";

const BUNDLE_RESULT = {
  name: "repo-conventions",
  description: "Coding conventions extracted from this repository.",
  type: "convention" as const,
  body: "# repo-conventions\n\n## naming\n- Service classes end in Service",
};

const {
  mockBundleMutate,
  mockAgents,
  mockAgentLinks,
  mockCreateMutate,
  mockCreatePending,
  mockSetAgentSkillsMutate,
  mockSetAgentSkillsPending,
} = vi.hoisted(() => ({
  mockBundleMutate: vi.fn(),
  mockAgents: { current: [] as Agent[] },
  mockAgentLinks: { current: [] as AgentSkillLink[] },
  mockCreateMutate: vi.fn(),
  mockCreatePending: { current: false },
  mockSetAgentSkillsMutate: vi.fn(),
  mockSetAgentSkillsPending: { current: false },
}));

vi.mock("@/lib/hooks/conventions", () => ({
  useBundleConventions: () => ({ mutate: mockBundleMutate, isPending: false, data: undefined }),
}));

vi.mock("@/lib/hooks/agents", () => ({
  useAgents: () => ({ data: mockAgents.current }),
}));

vi.mock("@/lib/hooks/skills", () => ({
  useAgentSkills: () => ({ data: mockAgentLinks.current }),
  useSetAgentSkills: () => ({
    mutate: mockSetAgentSkillsMutate,
    isPending: mockSetAgentSkillsPending.current,
  }),
  useCreateSkill: () => ({ mutate: mockCreateMutate, isPending: mockCreatePending.current }),
}));

vi.mock("@/lib/toast", () => ({
  useToast: () => ({ toast: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

import { BundleSkillModal } from "./BundleSkillModal";

afterEach(() => {
  cleanup();
  mockBundleMutate.mockReset();
  mockCreateMutate.mockReset();
  mockSetAgentSkillsMutate.mockReset();
  mockAgents.current = [];
  mockAgentLinks.current = [];
  mockCreatePending.current = false;
  mockSetAgentSkillsPending.current = false;
});

function bundleImmediately() {
  mockBundleMutate.mockImplementation((_v: undefined, opts?: { onSuccess?: (r: typeof BUNDLE_RESULT) => void }) => {
    opts?.onSuccess?.(BUNDLE_RESULT);
  });
}

const AGENT: Agent = {
  id: "ag1",
  name: "PR Reviewer",
  description: "",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "Review PRs.",
  enabled: true,
  version: 1,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
};

describe("BundleSkillModal", () => {
  it("prefills name/description/body from the bundle result on mount", () => {
    bundleImmediately();
    const { container } = render(<BundleSkillModal repoId="repo1" onClose={() => {}} />);

    expect(mockBundleMutate).toHaveBeenCalled();
    expect(screen.getByDisplayValue("repo-conventions")).toBeInTheDocument();
    // getByDisplayValue normalizes whitespace by default, collapsing this
    // multi-line body to one line — check the textarea's raw value instead.
    expect(container.querySelector("textarea")?.value).toBe(BUNDLE_RESULT.body);
  });

  it("creates the skill without linking when no agent is selected", () => {
    bundleImmediately();
    mockCreateMutate.mockImplementation(
      (_input: unknown, opts?: { onSuccess?: (s: { id: string; name: string }) => void }) => {
        opts?.onSuccess?.({ id: "sk-new", name: "repo-conventions" });
      },
    );
    const onClose = vi.fn();
    render(<BundleSkillModal repoId="repo1" onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));

    expect(mockCreateMutate).toHaveBeenCalledWith(
      {
        name: "repo-conventions",
        type: "convention",
        description: BUNDLE_RESULT.description,
        body: BUNDLE_RESULT.body,
      },
      expect.any(Object),
    );
    expect(mockSetAgentSkillsMutate).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("links the new skill by appending to the selected agent's existing skill ids", () => {
    bundleImmediately();
    mockAgents.current = [AGENT];
    mockAgentLinks.current = [{ agent_id: "ag1", skill_id: "sk-existing", order: 0 }];
    mockCreateMutate.mockImplementation(
      (_input: unknown, opts?: { onSuccess?: (s: { id: string; name: string }) => void }) => {
        opts?.onSuccess?.({ id: "sk-new", name: "repo-conventions" });
      },
    );
    mockSetAgentSkillsMutate.mockImplementation(
      (_ids: string[], opts?: { onSuccess?: () => void }) => {
        opts?.onSuccess?.();
      },
    );
    const onClose = vi.fn();
    render(<BundleSkillModal repoId="repo1" onClose={onClose} />);

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "ag1" } });
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));

    expect(mockSetAgentSkillsMutate).toHaveBeenCalledWith(
      ["sk-existing", "sk-new"],
      expect.any(Object),
    );
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("disables Create skill while the bundle result hasn't loaded yet", () => {
    // no bundleImmediately() call — mutate never resolves synchronously
    render(<BundleSkillModal repoId="repo1" onClose={() => {}} />);
    expect(screen.getByRole("button", { name: "Create skill" })).toBeDisabled();
  });
});
