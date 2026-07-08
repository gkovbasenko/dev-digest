import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { Skill } from "@devdigest/shared";

const { mockMutate, mockIsPending, mockDeleteMutate, mockDeletePending } = vi.hoisted(() => ({
  mockMutate: vi.fn(),
  mockIsPending: { current: false },
  mockDeleteMutate: vi.fn(),
  mockDeletePending: { current: false },
}));

vi.mock("../../../../lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutate: mockMutate, isPending: mockIsPending.current }),
  useDeleteSkill: () => ({ mutate: mockDeleteMutate, isPending: mockDeletePending.current }),
}));

vi.mock("../../../../lib/toast", () => ({
  useToast: () => ({ toast: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

// Stable (module-scoped) empty refs — SkillContextTab has a useEffect keyed on
// useSkillContext()'s result (same OOM-risk rationale as SkillsTab's
// linkedLinks effect; see client INSIGHTS 2026-07-01).
const { EMPTY_DOC_LIST, EMPTY_CONTEXT_LINKS } = vi.hoisted(() => ({
  EMPTY_DOC_LIST: { indexed: true, documents: [] } as { indexed: boolean; documents: never[] },
  EMPTY_CONTEXT_LINKS: [] as never[],
}));

vi.mock("../../../../lib/hooks/context", () => ({
  useContextDocs: () => ({ data: EMPTY_DOC_LIST }),
  useSkillContext: () => ({ data: EMPTY_CONTEXT_LINKS }),
  useSetSkillContext: () => ({ mutate: vi.fn(), isPending: false }),
  useContextFilePreview: () => ({ data: undefined, isLoading: false }),
}));

vi.mock("../../../../lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: "repo1" }),
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
    const { container } = render(<SkillPreview skill={BASE_SKILL} />);
    expect(container.querySelector("textarea.mono")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(container.querySelector("textarea.mono")).toHaveValue(BASE_SKILL.body);
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("Save sends the edited body and description as the mutation patch", () => {
    mockMutate.mockImplementation(() => {});
    const { container } = render(<SkillPreview skill={BASE_SKILL} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(container.querySelector("textarea.mono")!, {
      target: { value: "# Rule\nDo the NEW thing." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(mockMutate).toHaveBeenCalledWith(
      {
        id: "sk1",
        patch: {
          name: BASE_SKILL.name,
          type: BASE_SKILL.type,
          body: "# Rule\nDo the NEW thing.",
          description: BASE_SKILL.description,
        },
      },
      expect.any(Object),
    );
  });

  it("exits edit mode after a successful save", () => {
    mockMutate.mockImplementation((_vars, opts) => {
      opts?.onSuccess?.();
    });
    const { container } = render(<SkillPreview skill={BASE_SKILL} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(container.querySelector("textarea.mono")!, {
      target: { value: "# Rule\nDo the NEW thing." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(container.querySelector("textarea.mono")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("stays in edit mode with the typed body if the save fails (no onSuccess call)", () => {
    mockMutate.mockImplementation(() => {}); // never calls onSuccess — simulates a pending/failed save
    const { container } = render(<SkillPreview skill={BASE_SKILL} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(container.querySelector("textarea.mono")!, { target: { value: "unsaved edit" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(container.querySelector("textarea.mono")).toHaveValue("unsaved edit");
  });

  it("Cancel reverts to the original body and exits edit mode without mutating", () => {
    const { container } = render(<SkillPreview skill={BASE_SKILL} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(container.querySelector("textarea.mono")!, { target: { value: "a throwaway edit" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mockMutate).not.toHaveBeenCalled();
    expect(container.querySelector("textarea.mono")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();

    // Re-entering edit mode shows the ORIGINAL body, not the discarded edit.
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(container.querySelector("textarea.mono")).toHaveValue(BASE_SKILL.body);
  });

  it("disables Save and shows a pending label while the save mutation is in flight", () => {
    mockIsPending.current = true;
    render(<SkillPreview skill={BASE_SKILL} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  });
});

describe("SkillPreview — description", () => {
  afterEach(() => {
    mockMutate.mockReset();
    mockIsPending.current = false;
  });

  it("shows the skill's description when not editing", () => {
    render(<SkillPreview skill={BASE_SKILL} />);
    expect(screen.getByText(BASE_SKILL.description)).toBeInTheDocument();
  });

  it("shows a muted 'No description' placeholder when the skill has none", () => {
    render(<SkillPreview skill={{ ...BASE_SKILL, description: "" }} />);
    expect(screen.getByText("No description")).toBeInTheDocument();
  });

  it("Edit reveals an editable description field seeded with the current value", () => {
    render(<SkillPreview skill={BASE_SKILL} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByPlaceholderText("What does this skill check?")).toHaveValue(
      BASE_SKILL.description,
    );
  });

  it("Save sends the edited description in the mutation patch", () => {
    mockMutate.mockImplementation(() => {});
    render(<SkillPreview skill={BASE_SKILL} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByPlaceholderText("What does this skill check?"), {
      target: { value: "Updated description" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(mockMutate).toHaveBeenCalledWith(
      {
        id: "sk1",
        patch: {
          name: BASE_SKILL.name,
          type: BASE_SKILL.type,
          body: BASE_SKILL.body,
          description: "Updated description",
        },
      },
      expect.any(Object),
    );
  });

  it("Cancel reverts an edited description without mutating", () => {
    render(<SkillPreview skill={BASE_SKILL} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByPlaceholderText("What does this skill check?"), {
      target: { value: "A throwaway edit" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mockMutate).not.toHaveBeenCalled();
    expect(screen.getByText(BASE_SKILL.description)).toBeInTheDocument();
  });
});

describe("SkillPreview — name and type editing", () => {
  afterEach(() => {
    mockMutate.mockReset();
    mockIsPending.current = false;
  });

  it("shows the name as a heading and the type as a badge when not editing", () => {
    render(<SkillPreview skill={BASE_SKILL} />);
    expect(screen.getByRole("heading", { name: BASE_SKILL.name })).toBeInTheDocument();
    expect(screen.getByText(BASE_SKILL.type)).toBeInTheDocument();
  });

  it("Edit reveals editable name/type fields seeded with the current values", () => {
    render(<SkillPreview skill={BASE_SKILL} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByPlaceholderText("Skill name")).toHaveValue(BASE_SKILL.name);
    expect(screen.getByRole("combobox")).toHaveValue(BASE_SKILL.type);
  });

  it("Save sends the edited name and type in the mutation patch", () => {
    mockMutate.mockImplementation(() => {});
    render(<SkillPreview skill={BASE_SKILL} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByPlaceholderText("Skill name"), {
      target: { value: "renamed-skill" },
    });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "security" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(mockMutate).toHaveBeenCalledWith(
      {
        id: "sk1",
        patch: {
          name: "renamed-skill",
          type: "security",
          body: BASE_SKILL.body,
          description: BASE_SKILL.description,
        },
      },
      expect.any(Object),
    );
  });

  it("trims whitespace from the name before saving", () => {
    mockMutate.mockImplementation(() => {});
    render(<SkillPreview skill={BASE_SKILL} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByPlaceholderText("Skill name"), {
      target: { value: "  padded-name  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({ patch: expect.objectContaining({ name: "padded-name" }) }),
      expect.any(Object),
    );
  });

  it("disables Save when the name is emptied out or whitespace-only", () => {
    render(<SkillPreview skill={BASE_SKILL} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    fireEvent.change(screen.getByPlaceholderText("Skill name"), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("Cancel reverts an edited name/type without mutating", () => {
    render(<SkillPreview skill={BASE_SKILL} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByPlaceholderText("Skill name"), { target: { value: "throwaway" } });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "security" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mockMutate).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: BASE_SKILL.name })).toBeInTheDocument();
    expect(screen.getByText(BASE_SKILL.type)).toBeInTheDocument();
  });
});

describe("SkillPreview — onDirtyChange", () => {
  beforeEach(() => {
    mockMutate.mockReset();
    mockIsPending.current = false;
  });

  it("reports dirty only once editing AND the body actually differs from the saved value", () => {
    const onDirtyChange = vi.fn();
    const { container } = render(<SkillPreview skill={BASE_SKILL} onDirtyChange={onDirtyChange} />);
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    // Entering edit mode alone isn't dirty — the body hasn't changed yet.
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);

    fireEvent.change(container.querySelector("textarea.mono")!, { target: { value: "edited body" } });
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });

  it("reports dirty when only the description changes (body untouched)", () => {
    const onDirtyChange = vi.fn();
    render(<SkillPreview skill={BASE_SKILL} onDirtyChange={onDirtyChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByPlaceholderText("What does this skill check?"), {
      target: { value: "A new description" },
    });
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });

  it("reports not-dirty again after Cancel", () => {
    const onDirtyChange = vi.fn();
    const { container } = render(<SkillPreview skill={BASE_SKILL} onDirtyChange={onDirtyChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(container.querySelector("textarea.mono")!, { target: { value: "edited body" } });
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it("reports not-dirty again after a successful save", () => {
    mockMutate.mockImplementation((_vars, opts) => opts?.onSuccess?.());
    const onDirtyChange = vi.fn();
    const { container } = render(<SkillPreview skill={BASE_SKILL} onDirtyChange={onDirtyChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(container.querySelector("textarea.mono")!, { target: { value: "edited body" } });
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it("reports not-dirty on unmount (so a stale dirty flag can't leak into the next selection)", () => {
    const onDirtyChange = vi.fn();
    const { container, unmount } = render(
      <SkillPreview skill={BASE_SKILL} onDirtyChange={onDirtyChange} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(container.querySelector("textarea.mono")!, { target: { value: "edited body" } });
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    unmount();
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });
});

describe("SkillPreview — delete", () => {
  beforeEach(() => {
    mockDeleteMutate.mockReset();
    mockDeletePending.current = false;
  });

  it("asks for confirmation, then deletes and calls onDeleted when confirmed", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    mockDeleteMutate.mockImplementation((_id, opts) => opts?.onSuccess?.());
    const onDeleted = vi.fn();

    render(<SkillPreview skill={BASE_SKILL} onDeleted={onDeleted} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete skill" }));

    expect(confirmSpy).toHaveBeenCalledWith('Delete skill "pr-quality-rubric"? This cannot be undone.');
    expect(mockDeleteMutate).toHaveBeenCalledWith("sk1", expect.any(Object));
    expect(onDeleted).toHaveBeenCalledOnce();

    confirmSpy.mockRestore();
  });

  it("does not delete when the confirmation is declined", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const onDeleted = vi.fn();

    render(<SkillPreview skill={BASE_SKILL} onDeleted={onDeleted} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete skill" }));

    expect(mockDeleteMutate).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it("disables the delete button while the delete mutation is pending", () => {
    mockDeletePending.current = true;
    render(<SkillPreview skill={BASE_SKILL} />);
    expect(screen.getByRole("button", { name: "Delete skill" })).toBeDisabled();
  });
});

describe("SkillPreview — Context tab (T11)", () => {
  it("defaults to the Details tab (unchanged behavior)", () => {
    render(<SkillPreview skill={BASE_SKILL} />);
    expect(screen.getByText("Skill body (Markdown)")).toBeInTheDocument();
    expect(screen.queryByText("Project context to use")).not.toBeInTheDocument();
  });

  it("switching to the Context tab shows SkillContextTab's content and hides the Details body", () => {
    render(<SkillPreview skill={BASE_SKILL} />);
    fireEvent.click(screen.getByRole("button", { name: "Context" }));

    expect(screen.getByText("Project context to use")).toBeInTheDocument();
    expect(screen.queryByText("Skill body (Markdown)")).not.toBeInTheDocument();
  });
});
