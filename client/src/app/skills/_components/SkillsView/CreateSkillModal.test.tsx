import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

const { mockMutate, mockIsPending } = vi.hoisted(() => ({
  mockMutate: vi.fn(),
  mockIsPending: { current: false },
}));

vi.mock("../../../../lib/hooks/skills", () => ({
  useCreateSkill: () => ({ mutate: mockMutate, isPending: mockIsPending.current }),
}));

vi.mock("../../../../lib/toast", () => ({
  useToast: () => ({ toast: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

import { CreateSkillModal } from "./CreateSkillModal";

afterEach(cleanup);

describe("CreateSkillModal", () => {
  it("disables Create until both name and body are filled in", () => {
    mockMutate.mockReset();
    render(<CreateSkillModal onClose={() => {}} />);

    const createButton = screen.getByRole("button", { name: "Create skill" });
    expect(createButton).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("pr-quality-rubric"), {
      target: { value: "my-rule" },
    });
    expect(createButton).toBeDisabled(); // body still empty

    fireEvent.change(screen.getByPlaceholderText("# Rule Describe the rule…"), {
      target: { value: "# Rule\nDo the thing." },
    });
    expect(createButton).not.toBeDisabled();
  });

  it("does not submit on whitespace-only name/body", () => {
    mockMutate.mockReset();
    render(<CreateSkillModal onClose={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText("pr-quality-rubric"), {
      target: { value: "   " },
    });
    fireEvent.change(screen.getByPlaceholderText("# Rule Describe the rule…"), {
      target: { value: "   " },
    });

    expect(screen.getByRole("button", { name: "Create skill" })).toBeDisabled();
  });

  it("submits with trimmed fields and defaults type to custom", () => {
    mockMutate.mockReset();
    render(<CreateSkillModal onClose={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText("pr-quality-rubric"), {
      target: { value: "  my-rule  " },
    });
    fireEvent.change(screen.getByPlaceholderText("# Rule Describe the rule…"), {
      target: { value: "  # Rule\nDo the thing.  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));

    expect(mockMutate).toHaveBeenCalledWith(
      { name: "my-rule", type: "custom", description: "", body: "# Rule\nDo the thing." },
      expect.any(Object),
    );
  });

  it("calls onCreated and onClose with the new skill's id on success", () => {
    mockMutate.mockReset();
    mockMutate.mockImplementation((_input, opts) => {
      opts?.onSuccess?.({ id: "new-skill-1", name: "my-rule" });
    });
    const onCreated = vi.fn();
    const onClose = vi.fn();

    render(<CreateSkillModal onClose={onClose} onCreated={onCreated} />);
    fireEvent.change(screen.getByPlaceholderText("pr-quality-rubric"), {
      target: { value: "my-rule" },
    });
    fireEvent.change(screen.getByPlaceholderText("# Rule Describe the rule…"), {
      target: { value: "# Rule\nDo the thing." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));

    expect(onCreated).toHaveBeenCalledWith("new-skill-1");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows a pending label while the mutation is in flight", () => {
    mockMutate.mockReset();
    mockIsPending.current = true;
    render(<CreateSkillModal onClose={() => {}} />);
    expect(screen.getByRole("button", { name: "Creating…" })).toBeInTheDocument();
    mockIsPending.current = false;
  });
});
