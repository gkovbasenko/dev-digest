import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { Skill } from "@devdigest/shared";

const { mockUseSkills, mockUseSkill, mockPush, mockReplace } = vi.hoisted(() => ({
  mockUseSkills: { current: { data: [] as Skill[] } },
  mockUseSkill: { current: {} as Record<string, unknown> },
  mockPush: vi.fn(),
  mockReplace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "sk1" }),
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

vi.mock("../../../lib/hooks/skills", () => ({
  useSkills: () => mockUseSkills.current,
  useSkill: () => mockUseSkill.current,
}));

// AppShell pulls in nav/layout chrome the page smoke test doesn't care about.
vi.mock("../../../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// The tabbed detail is exercised by SkillDetail.test.tsx — here we only assert
// the PAGE wires it in and handles load/error/navigation.
vi.mock("./_components/SkillDetail", () => ({
  SkillDetail: (props: { tab: string }) => <div data-testid="skill-detail">detail:{props.tab}</div>,
}));

// Isolate rail-item click behavior from SkillListItem's own DOM.
vi.mock("../_components/SkillsView/SkillListItem", () => ({
  SkillListItem: ({ skill, onClick }: { skill: Skill; onClick: () => void }) => (
    <button onClick={onClick}>rail:{skill.name}</button>
  ),
}));

import SkillDetailPage from "./page";

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
const OTHER: Skill = { ...SKILL, id: "sk2", name: "other-skill" };

afterEach(() => {
  cleanup();
  mockPush.mockReset();
  mockReplace.mockReset();
  mockUseSkills.current = { data: [] };
  mockUseSkill.current = {};
});

describe("SkillDetailPage", () => {
  it("renders the loaded skill header, the tabbed detail, and the skill rail", () => {
    mockUseSkills.current = { data: [SKILL, OTHER] };
    mockUseSkill.current = { data: SKILL, isLoading: false, isError: false };

    render(<SkillDetailPage />);

    expect(screen.getByRole("heading", { name: SKILL.name })).toBeInTheDocument();
    // defaults to the config tab when ?tab= is absent
    expect(screen.getByTestId("skill-detail")).toHaveTextContent("detail:config");
    expect(screen.getByText("rail:pr-quality-rubric")).toBeInTheDocument();
    expect(screen.getByText("rail:other-skill")).toBeInTheDocument();
  });

  it("renders an error state when the skill fails to load", () => {
    mockUseSkills.current = { data: [] };
    mockUseSkill.current = { data: undefined, isLoading: false, isError: true, refetch: vi.fn() };

    render(<SkillDetailPage />);

    expect(screen.getByText(/load this skill/i)).toBeInTheDocument();
    expect(screen.queryByTestId("skill-detail")).not.toBeInTheDocument();
  });

  it("navigates to another skill's route when its rail item is clicked", () => {
    mockUseSkills.current = { data: [SKILL, OTHER] };
    mockUseSkill.current = { data: SKILL, isLoading: false, isError: false };

    render(<SkillDetailPage />);
    fireEvent.click(screen.getByText("rail:other-skill"));

    expect(mockPush).toHaveBeenCalledWith("/skills/sk2?tab=config");
  });
});
