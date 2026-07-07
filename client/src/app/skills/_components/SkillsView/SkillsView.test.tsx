import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { Skill } from "@devdigest/shared";

const { mockRouterPush, mockSkills, mockIsLoading } = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
  mockSkills: { current: [] as Skill[] },
  mockIsLoading: { current: false },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockRouterPush, replace: vi.fn() }),
}));

// SkillsView renders AddSkillDrawer and CreateSkillModal for real (not
// mocked) — so every hook they use from lib/hooks/skills must be covered
// here.
vi.mock("../../../../lib/hooks/skills", () => ({
  useSkills: () => ({ data: mockSkills.current, isLoading: mockIsLoading.current }),
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
  mockRouterPush.mockReset();
  mockSkills.current = [];
  mockIsLoading.current = false;
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

  it("lists skills and shows the 'select a skill' placeholder", () => {
    mockSkills.current = [SKILL_A, SKILL_B];
    render(<SkillsView />);
    expect(screen.getByText("Skill A")).toBeInTheDocument();
    expect(screen.getByText("Skill B")).toBeInTheDocument();
    expect(screen.getByText("Select a skill")).toBeInTheDocument();
  });

  it("clicking a skill row navigates to its dedicated /skills/:id route", () => {
    mockSkills.current = [SKILL_A, SKILL_B];
    render(<SkillsView />);
    fireEvent.click(screen.getByText("Skill B"));
    expect(mockRouterPush).toHaveBeenCalledWith("/skills/sk-b");
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
    // disambiguate via the modal's distinguishing subtitle instead.
    expect(
      screen.getByText("An agent skill is a focused review rule — a rubric, convention, or security check."),
    ).toBeInTheDocument();
  });
});
