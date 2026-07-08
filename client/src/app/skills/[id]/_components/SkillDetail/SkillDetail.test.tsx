import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { Skill, SkillVersion, SkillStats } from "@devdigest/shared";

const {
  mockUpdateMutate,
  mockDeleteMutate,
  mockRestoreMutate,
  mockRestorePending,
  mockVersions,
  mockVersionsLoading,
  mockVersionsError,
  mockStats,
  mockStatsLoading,
  mockStatsError,
} = vi.hoisted(() => ({
  mockUpdateMutate: vi.fn(),
  mockDeleteMutate: vi.fn(),
  mockRestoreMutate: vi.fn(),
  mockRestorePending: { current: false },
  mockVersions: { current: [] as SkillVersion[] },
  mockVersionsLoading: { current: false },
  mockVersionsError: { current: false },
  mockStats: { current: undefined as SkillStats | undefined },
  mockStatsLoading: { current: false },
  mockStatsError: { current: false },
}));

// SkillDetail renders the real SkillPreview (Config tab), PreviewTab,
// StatsTab, and VersionsTab — so every hook any of them use from
// lib/hooks/skills must be covered here.
vi.mock("../../../../../lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutate: mockUpdateMutate, isPending: false }),
  useDeleteSkill: () => ({ mutate: mockDeleteMutate, isPending: false }),
  useSkillVersions: () => ({
    data: mockVersionsError.current ? undefined : mockVersions.current,
    isLoading: mockVersionsLoading.current,
    isError: mockVersionsError.current,
  }),
  useSkillStats: () => ({
    data: mockStatsError.current ? undefined : mockStats.current,
    isLoading: mockStatsLoading.current,
    isError: mockStatsError.current,
  }),
  useRestoreSkillVersion: () => ({ mutate: mockRestoreMutate, isPending: mockRestorePending.current }),
}));

vi.mock("../../../../../lib/toast", () => ({
  useToast: () => ({ toast: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

// The Context tab renders the real SkillContextTab — stub its data hooks with
// stable module-scoped refs (SkillContextTab has a useEffect keyed on
// useSkillContext()'s result; a fresh literal per call OOMs the worker — see
// client INSIGHTS 2026-07-01).
const { EMPTY_DOC_LIST, EMPTY_CTX_LINKS } = vi.hoisted(() => ({
  EMPTY_DOC_LIST: { indexed: true, documents: [] } as { indexed: boolean; documents: never[] },
  EMPTY_CTX_LINKS: [] as never[],
}));
vi.mock("../../../../../lib/hooks/context", () => ({
  useContextDocs: () => ({ data: EMPTY_DOC_LIST }),
  useSkillContext: () => ({ data: EMPTY_CTX_LINKS }),
  useSetSkillContext: () => ({ mutate: vi.fn(), isPending: false }),
  useContextFilePreview: () => ({ data: undefined, isLoading: false }),
}));
vi.mock("../../../../../lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: "repo1" }),
}));

import { SkillDetail } from "./SkillDetail";

afterEach(() => {
  cleanup();
  mockUpdateMutate.mockReset();
  mockDeleteMutate.mockReset();
  mockRestoreMutate.mockReset();
  mockRestorePending.current = false;
  mockVersions.current = [];
  mockVersionsLoading.current = false;
  mockVersionsError.current = false;
  mockStats.current = undefined;
  mockStatsLoading.current = false;
  mockStatsError.current = false;
});

const SKILL: Skill = {
  id: "sk1",
  name: "pr-quality-rubric",
  description: "Checks PR quality",
  type: "rubric",
  source: "manual",
  body: "# Rule\nDo the thing.",
  enabled: true,
  version: 2,
  evidence_files: null,
};

function renderDetail(tab: string, onTab = vi.fn()) {
  return render(<SkillDetail skill={SKILL} tab={tab} onTab={onTab} />);
}

describe("SkillDetail — tab switching", () => {
  it("renders the Config tab (SkillPreview) content", () => {
    renderDetail("config");
    expect(screen.getByRole("heading", { name: SKILL.name })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("renders the Preview tab's rendered markdown", () => {
    renderDetail("preview");
    expect(screen.getByText("Do the thing.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("renders the Stats tab", () => {
    mockStats.current = {
      agent_count: 3,
      version_count: 2,
      run_usage_count: 7,
      last_used_at: null,
      source: "manual",
      created_at: "2026-01-01T00:00:00.000Z",
    };
    renderDetail("stats");
    expect(screen.getByText("Agents using this skill")).toBeInTheDocument();
    expect(screen.getByText("Never used")).toBeInTheDocument();
  });

  it("renders the Versions tab", () => {
    mockVersions.current = [
      { version: 2, body: "# v2", created_at: "2026-01-02T00:00:00.000Z" },
      { version: 1, body: "# v1", created_at: "2026-01-01T00:00:00.000Z" },
    ];
    renderDetail("versions");
    expect(screen.getByText("v2")).toBeInTheDocument();
    expect(screen.getByText("v1")).toBeInTheDocument();
  });

  it("clicking a tab button calls onTab with no unsaved edit in progress", () => {
    const onTab = vi.fn();
    renderDetail("config", onTab);
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(onTab).toHaveBeenCalledWith("preview");
  });
});

describe("SkillDetail — Config dirty-guard on tab switch", () => {
  it("confirms before switching tabs away from an unsaved Config edit, and does not switch if declined", () => {
    const onTab = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { container } = renderDetail("config", onTab);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(container.querySelector("textarea.mono")!, { target: { value: "edited body" } });

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(onTab).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it("switches tabs when the user confirms discarding the unsaved edit", () => {
    const onTab = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { container } = renderDetail("config", onTab);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(container.querySelector("textarea.mono")!, { target: { value: "edited body" } });

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    expect(onTab).toHaveBeenCalledWith("preview");

    confirmSpy.mockRestore();
  });

  it("does not prompt when switching tabs with no unsaved edit", () => {
    const onTab = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderDetail("config", onTab);

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(onTab).toHaveBeenCalledWith("preview");

    confirmSpy.mockRestore();
  });
});

describe("SkillDetail — Versions tab restore", () => {
  it("confirms, then calls the restore mutation exactly once for the chosen version", () => {
    mockVersions.current = [
      { version: 2, body: "# v2", created_at: "2026-01-02T00:00:00.000Z" },
      { version: 1, body: "# v1", created_at: "2026-01-01T00:00:00.000Z" },
    ];
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderDetail("versions");

    const restoreButtons = screen.getAllByRole("button", { name: "Restore" });
    // v2 (current) has its Restore button disabled; v1's is the enabled one.
    fireEvent.click(restoreButtons[1]!);

    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(mockRestoreMutate).toHaveBeenCalledTimes(1);
    expect(mockRestoreMutate).toHaveBeenCalledWith({ id: "sk1", version: 1 }, expect.any(Object));

    confirmSpy.mockRestore();
  });

  it("disables the Restore button for the current version and disables all while a restore is pending", () => {
    mockVersions.current = [
      { version: 2, body: "# v2", created_at: "2026-01-02T00:00:00.000Z" },
      { version: 1, body: "# v1", created_at: "2026-01-01T00:00:00.000Z" },
    ];
    mockRestorePending.current = true;
    renderDetail("versions");

    const restoreButtons = screen.getAllByRole("button", { name: "Restore" });
    expect(restoreButtons[0]).toBeDisabled(); // current version
    expect(restoreButtons[1]).toBeDisabled(); // disabled while pending
  });

  it("does not restore when the confirmation is declined", () => {
    mockVersions.current = [{ version: 1, body: "# v1", created_at: "2026-01-01T00:00:00.000Z" }];
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderDetail("versions");

    fireEvent.click(screen.getByRole("button", { name: "Restore" }));

    expect(mockRestoreMutate).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });
});

describe("SkillDetail — Stats/Versions error states", () => {
  it("shows an error state when stats fail to load", () => {
    mockStatsError.current = true;
    renderDetail("stats");
    expect(screen.getByText("Couldn't load stats")).toBeInTheDocument();
    // The stat rows are not rendered when the query errors.
    expect(screen.queryByText("Agents using this skill")).not.toBeInTheDocument();
  });

  it("shows an error state when versions fail to load", () => {
    mockVersionsError.current = true;
    renderDetail("versions");
    expect(screen.getByText("Couldn't load versions")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Restore" })).not.toBeInTheDocument();
  });
});

describe("SkillDetail — Context tab (top-level)", () => {
  it("renders SkillContextTab when the Context tab is active", () => {
    renderDetail("context");
    expect(screen.getByText("Project context to use")).toBeInTheDocument();
    // Config-tab content is not shown while on Context.
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("Context is a top-level tab button (peer of Config/Preview/Stats/Versions) that calls onTab", () => {
    const onTab = vi.fn();
    renderDetail("config", onTab);
    fireEvent.click(screen.getByRole("button", { name: "Context" }));
    expect(onTab).toHaveBeenCalledWith("context");
  });
});
