import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { Skill } from "@devdigest/shared";

const { mockRouterReplace, mockSearchParams, mockSkills, mockIsLoading, mockSelectedSkill } = vi.hoisted(() => ({
  mockRouterReplace: vi.fn(),
  mockSearchParams: { current: new URLSearchParams() },
  mockSkills: { current: [] as Skill[] },
  mockIsLoading: { current: false },
  mockSelectedSkill: { current: undefined as Skill | undefined },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockRouterReplace, push: vi.fn() }),
  useSearchParams: () => mockSearchParams.current,
}));

// SkillsView renders SkillListItem, SkillPreview, AddSkillDrawer, and
// CreateSkillModal for real (not mocked) — so every hook any of them use
// from lib/hooks/skills must be covered here.
vi.mock("../../../../lib/hooks/skills", () => ({
  useSkills: () => ({ data: mockSkills.current, isLoading: mockIsLoading.current }),
  useSkill: () => ({ data: mockSelectedSkill.current }),
  useUpdateSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useImportSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateSkill: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("../../../../lib/toast", () => ({
  useToast: () => ({ toast: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

vi.mock("../../../../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { SkillsView } from "./SkillsView";

afterEach(() => {
  cleanup();
  mockRouterReplace.mockReset();
  mockSearchParams.current = new URLSearchParams();
  mockSkills.current = [];
  mockIsLoading.current = false;
  mockSelectedSkill.current = undefined;
});

const SKILL_A: Skill = {
  id: "sk-a",
  name: "Skill A",
  description: "",
  type: "rubric",
  source: "manual",
  body: "# A",
  enabled: true,
  version: 1,
  evidence_files: null,
};
const SKILL_B: Skill = { ...SKILL_A, id: "sk-b", name: "Skill B" };

describe("SkillsView", () => {
  it("shows loading skeletons while skills are loading, not the empty state", () => {
    mockIsLoading.current = true;
    const { container } = render(<SkillsView />);
    expect(container.querySelectorAll(".skeleton").length).toBe(3);
    expect(screen.queryByText("No skills yet")).not.toBeInTheDocument();
  });

  it("shows the empty state when there are no skills", () => {
    mockSkills.current = [];
    render(<SkillsView />);
    expect(screen.getByText("No skills yet")).toBeInTheDocument();
  });

  it("lists skills and shows the 'select a skill' placeholder when none is selected", () => {
    mockSkills.current = [SKILL_A, SKILL_B];
    render(<SkillsView />);
    expect(screen.getByText("Skill A")).toBeInTheDocument();
    expect(screen.getByText("Skill B")).toBeInTheDocument();
    expect(screen.getByText("Select a skill")).toBeInTheDocument();
  });

  it("clicking a skill row navigates by setting ?selected=<id> via router.replace", () => {
    mockSkills.current = [SKILL_A, SKILL_B];
    render(<SkillsView />);
    fireEvent.click(screen.getByText("Skill B"));
    expect(mockRouterReplace).toHaveBeenCalledWith("/skills?selected=sk-b");
  });

  it("shows the SkillPreview for the skill matching ?selected=", () => {
    mockSkills.current = [SKILL_A, SKILL_B];
    mockSearchParams.current = new URLSearchParams("selected=sk-a");
    mockSelectedSkill.current = SKILL_A;
    render(<SkillsView />);
    expect(screen.queryByText("Select a skill")).not.toBeInTheDocument();
    // SkillPreview renders the skill name as its heading.
    expect(screen.getByRole("heading", { name: "Skill A" })).toBeInTheDocument();
  });

  it("opens the AddSkillDrawer (file tab) from the Add Skill dropdown", () => {
    mockSkills.current = [SKILL_A];
    render(<SkillsView />);
    fireEvent.click(screen.getByRole("button", { name: "Add Skill" }));
    fireEvent.click(screen.getByText("Import from file"));
    expect(screen.getByText("Add a skill")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import skill" })).toBeInTheDocument();
  });

  it("opens the AddSkillDrawer on the url tab from the dropdown", () => {
    mockSkills.current = [SKILL_A];
    render(<SkillsView />);
    fireEvent.click(screen.getByRole("button", { name: "Add Skill" }));
    fireEvent.click(screen.getByText("Import from URL"));
    expect(screen.getByRole("button", { name: "Import from URL" })).toBeInTheDocument();
  });

  it("opens the CreateSkillModal from the dropdown", () => {
    mockSkills.current = [SKILL_A];
    render(<SkillsView />);
    fireEvent.click(screen.getByRole("button", { name: "Add Skill" }));
    fireEvent.click(screen.getByText("Create from scratch"));
    // "Create skill" matches both the modal title and its submit button, so
    // assert on the modal's distinguishing subtitle instead.
    expect(
      screen.getByText("An agent skill is a focused review rule — a rubric, convention, or security check."),
    ).toBeInTheDocument();
  });
});

describe("SkillsView — confirm before discarding an unsaved edit", () => {
  it("confirms before switching away from a skill with an unsaved edit, and does not switch if the user cancels", () => {
    mockSkills.current = [SKILL_A, SKILL_B];
    mockSearchParams.current = new URLSearchParams("selected=sk-a");
    mockSelectedSkill.current = SKILL_A;
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<SkillsView />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "edited body" } });

    mockRouterReplace.mockReset();
    fireEvent.click(screen.getByText("Skill B"));

    expect(confirmSpy).toHaveBeenCalled();
    expect(mockRouterReplace).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it("switches away when the user confirms discarding the unsaved edit", () => {
    mockSkills.current = [SKILL_A, SKILL_B];
    mockSearchParams.current = new URLSearchParams("selected=sk-a");
    mockSelectedSkill.current = SKILL_A;
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<SkillsView />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "edited body" } });

    mockRouterReplace.mockReset();
    fireEvent.click(screen.getByText("Skill B"));

    expect(mockRouterReplace).toHaveBeenCalledWith("/skills?selected=sk-b");

    confirmSpy.mockRestore();
  });

  it("does not prompt when switching away from a skill with no unsaved edit", () => {
    mockSkills.current = [SKILL_A, SKILL_B];
    mockSearchParams.current = new URLSearchParams("selected=sk-a");
    mockSelectedSkill.current = SKILL_A;
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<SkillsView />);
    fireEvent.click(screen.getByText("Skill B"));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(mockRouterReplace).toHaveBeenCalledWith("/skills?selected=sk-b");

    confirmSpy.mockRestore();
  });
});
