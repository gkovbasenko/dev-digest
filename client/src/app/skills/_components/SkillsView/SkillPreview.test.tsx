import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { Skill } from "@devdigest/shared";

const { mockMutate, mockIsPending } = vi.hoisted(() => ({
  mockMutate: vi.fn(),
  mockIsPending: { current: false },
}));

vi.mock("../../../../lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutate: mockMutate, isPending: mockIsPending.current }),
}));

vi.mock("../../../../lib/toast", () => ({
  useToast: () => ({ toast: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

import { SkillPreview } from "./SkillPreview";

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

/**
 * Regression coverage: toggleEnabled recomputes !skill.enabled from the
 * `skill` prop on every click. Without a pending guard, two rapid clicks
 * before the first mutation's onSuccess updates that prop both read the
 * same stale value and send the identical patch — silently swallowing the
 * user's second click (intended to toggle back).
 */
describe("SkillPreview — enabled toggle", () => {
  it("toggles enabled once per click", () => {
    mockMutate.mockReset();
    mockIsPending.current = false;

    render(<SkillPreview skill={BASE_SKILL} />);
    fireEvent.click(screen.getByRole("switch"));

    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate).toHaveBeenCalledWith({ id: "sk1", patch: { enabled: false } });
  });

  it("ignores a second click while the toggle mutation is still pending", () => {
    mockMutate.mockReset();
    mockIsPending.current = true; // simulates: first click's mutation hasn't resolved yet

    render(<SkillPreview skill={BASE_SKILL} />);
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("switch"));

    expect(mockMutate).not.toHaveBeenCalled();
    mockIsPending.current = false;
  });
});
