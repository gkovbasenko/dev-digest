import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
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
    expect(mockMutate).toHaveBeenCalledWith(
      { id: "sk1", patch: { enabled: false } },
      expect.any(Object),
    );
  });

  it("optimistically flips the switch immediately, before the mutation resolves", () => {
    mockMutate.mockReset();
    mockMutate.mockImplementation(() => {}); // never resolves — stays in the optimistic window
    mockIsPending.current = false;

    render(<SkillPreview skill={BASE_SKILL} />);
    const toggle = screen.getByRole("switch");
    expect(toggle).toHaveAttribute("aria-checked", "true");

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  it("reverts the optimistic toggle if the mutation fails", () => {
    mockMutate.mockReset();
    mockMutate.mockImplementation((_vars, opts) => {
      opts?.onError?.();
    });
    mockIsPending.current = false;

    render(<SkillPreview skill={BASE_SKILL} />);
    const toggle = screen.getByRole("switch");

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-checked", "true");
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

describe("SkillPreview — inline edit/save/cancel", () => {
  afterEach(() => {
    mockMutate.mockReset();
    mockIsPending.current = false;
  });

  it("Edit switches to the textarea, seeded with the current body", () => {
    render(<SkillPreview skill={BASE_SKILL} />);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByRole("textbox")).toHaveValue(BASE_SKILL.body);
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("Save sends the edited body as the mutation patch", () => {
    mockMutate.mockImplementation(() => {});
    render(<SkillPreview skill={BASE_SKILL} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "# Rule\nDo the NEW thing." } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(mockMutate).toHaveBeenCalledWith(
      { id: "sk1", patch: { body: "# Rule\nDo the NEW thing." } },
      expect.any(Object),
    );
  });

  it("exits edit mode after a successful save", () => {
    mockMutate.mockImplementation((_vars, opts) => {
      opts?.onSuccess?.();
    });
    render(<SkillPreview skill={BASE_SKILL} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "# Rule\nDo the NEW thing." } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("stays in edit mode with the typed body if the save fails (no onSuccess call)", () => {
    mockMutate.mockImplementation(() => {}); // never calls onSuccess — simulates a pending/failed save
    render(<SkillPreview skill={BASE_SKILL} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "unsaved edit" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("textbox")).toHaveValue("unsaved edit");
  });

  it("Cancel reverts to the original body and exits edit mode without mutating", () => {
    render(<SkillPreview skill={BASE_SKILL} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "a throwaway edit" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mockMutate).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();

    // Re-entering edit mode shows the ORIGINAL body, not the discarded edit.
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("textbox")).toHaveValue(BASE_SKILL.body);
  });

  it("disables Save and shows a pending label while the save mutation is in flight", () => {
    mockIsPending.current = true;
    render(<SkillPreview skill={BASE_SKILL} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  });
});

describe("SkillPreview — onDirtyChange", () => {
  beforeEach(() => {
    mockMutate.mockReset();
    mockIsPending.current = false;
  });

  it("reports dirty only once editing AND the body actually differs from the saved value", () => {
    const onDirtyChange = vi.fn();
    render(<SkillPreview skill={BASE_SKILL} onDirtyChange={onDirtyChange} />);
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    // Entering edit mode alone isn't dirty — the body hasn't changed yet.
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "edited body" } });
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });

  it("reports not-dirty again after Cancel", () => {
    const onDirtyChange = vi.fn();
    render(<SkillPreview skill={BASE_SKILL} onDirtyChange={onDirtyChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "edited body" } });
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it("reports not-dirty again after a successful save", () => {
    mockMutate.mockImplementation((_vars, opts) => opts?.onSuccess?.());
    const onDirtyChange = vi.fn();
    render(<SkillPreview skill={BASE_SKILL} onDirtyChange={onDirtyChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "edited body" } });
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it("reports not-dirty on unmount (so a stale dirty flag can't leak into the next selection)", () => {
    const onDirtyChange = vi.fn();
    const { unmount } = render(<SkillPreview skill={BASE_SKILL} onDirtyChange={onDirtyChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "edited body" } });
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    unmount();
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });
});
