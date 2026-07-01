import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { Skill } from "@devdigest/shared";
import { SkillListItem } from "./SkillListItem";

afterEach(cleanup);

const BASE_SKILL: Skill = {
  id: "sk1",
  name: "pr-quality-rubric",
  description: "Checks PR quality",
  type: "rubric",
  source: "manual",
  body: "# Rule\nDo the thing.",
  enabled: true,
  version: 1,
  evidence_files: null,
};

describe("SkillListItem", () => {
  it("renders the skill name and type badge", () => {
    render(<SkillListItem skill={BASE_SKILL} active={false} onClick={() => {}} />);
    expect(screen.getByText("pr-quality-rubric")).toBeInTheDocument();
    expect(screen.getByText("rubric")).toBeInTheDocument();
  });

  it("does NOT show 'needs vetting' badge for an enabled manual skill", () => {
    render(<SkillListItem skill={BASE_SKILL} active={false} onClick={() => {}} />);
    expect(screen.queryByText("needs vetting")).not.toBeInTheDocument();
  });

  it("does NOT show 'needs vetting' badge for a disabled manual skill (manual = trusted)", () => {
    render(
      <SkillListItem
        skill={{ ...BASE_SKILL, enabled: false, source: "manual" }}
        active={false}
        onClick={() => {}}
      />,
    );
    expect(screen.queryByText("needs vetting")).not.toBeInTheDocument();
  });

  it("shows 'needs vetting' badge for a disabled imported_url skill", () => {
    render(
      <SkillListItem
        skill={{ ...BASE_SKILL, enabled: false, source: "imported_url" }}
        active={false}
        onClick={() => {}}
      />,
    );
    expect(screen.getByText("needs vetting")).toBeInTheDocument();
  });

  it("does NOT show 'needs vetting' if the imported skill is enabled (already vetted)", () => {
    render(
      <SkillListItem
        skill={{ ...BASE_SKILL, enabled: true, source: "imported_url" }}
        active={false}
        onClick={() => {}}
      />,
    );
    expect(screen.queryByText("needs vetting")).not.toBeInTheDocument();
  });

  it("calls onClick when the row is clicked", () => {
    const onClick = vi.fn();
    render(<SkillListItem skill={BASE_SKILL} active={false} onClick={onClick} />);
    fireEvent.click(screen.getByText("pr-quality-rubric"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders all four type badges correctly", () => {
    const types = ["rubric", "convention", "security", "custom"] as const;
    types.forEach((type) => {
      const { unmount } = render(
        <SkillListItem skill={{ ...BASE_SKILL, type }} active={false} onClick={() => {}} />,
      );
      expect(screen.getByText(type)).toBeInTheDocument();
      unmount();
    });
  });
});
