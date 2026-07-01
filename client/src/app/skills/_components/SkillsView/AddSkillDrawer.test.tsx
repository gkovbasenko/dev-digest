import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

const { mockMutate, mockIsPending } = vi.hoisted(() => ({
  mockMutate: vi.fn(),
  mockIsPending: { current: false },
}));

vi.mock("../../../../lib/hooks/skills", () => ({
  useImportSkill: () => ({ mutate: mockMutate, isPending: mockIsPending.current }),
}));

vi.mock("../../../../lib/toast", () => ({
  useToast: () => ({ toast: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

import { AddSkillDrawer } from "./AddSkillDrawer";

afterEach(cleanup);

describe("AddSkillDrawer — file tab", () => {
  it("disables Import skill until the body is non-empty", () => {
    mockMutate.mockReset();
    render(<AddSkillDrawer onClose={() => {}} />);

    const importButton = screen.getByRole("button", { name: "Import skill" });
    expect(importButton).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("# Rule Describe the rule…"), {
      target: { value: "# Rule\nDo the thing." },
    });
    expect(importButton).not.toBeDisabled();
  });

  it("does not submit on whitespace-only body", () => {
    mockMutate.mockReset();
    render(<AddSkillDrawer onClose={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText("# Rule Describe the rule…"), {
      target: { value: "   " },
    });
    expect(screen.getByRole("button", { name: "Import skill" })).toBeDisabled();
  });

  it("submits markdown + optional name, undefined when name is blank", () => {
    mockMutate.mockReset();
    render(<AddSkillDrawer onClose={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText("# Rule Describe the rule…"), {
      target: { value: "# Rule\nDo the thing." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import skill" }));

    expect(mockMutate).toHaveBeenCalledWith(
      { markdown: "# Rule\nDo the thing.", name: undefined },
      expect.any(Object),
    );
  });

  it("trims a provided name and passes it through", () => {
    mockMutate.mockReset();
    render(<AddSkillDrawer onClose={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText("pr-quality-rubric"), {
      target: { value: "  my-rule  " },
    });
    fireEvent.change(screen.getByPlaceholderText("# Rule Describe the rule…"), {
      target: { value: "# Rule\nDo the thing." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import skill" }));

    expect(mockMutate).toHaveBeenCalledWith(
      { markdown: "# Rule\nDo the thing.", name: "my-rule" },
      expect.any(Object),
    );
  });

  it("calls onImported and onClose with the new skill's id on success", () => {
    mockMutate.mockReset();
    mockMutate.mockImplementation((_input, opts) => {
      opts?.onSuccess?.({ id: "imported-1", name: "Imported Skill" });
    });
    const onImported = vi.fn();
    const onClose = vi.fn();

    render(<AddSkillDrawer onClose={onClose} onImported={onImported} />);
    fireEvent.change(screen.getByPlaceholderText("# Rule Describe the rule…"), {
      target: { value: "# Rule\nDo the thing." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import skill" }));

    expect(onImported).toHaveBeenCalledWith("imported-1");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows a pending label while importing", () => {
    mockMutate.mockReset();
    mockIsPending.current = true;
    render(<AddSkillDrawer onClose={() => {}} />);
    expect(screen.getByRole("button", { name: "Importing…" })).toBeInTheDocument();
    mockIsPending.current = false;
  });
});

describe("AddSkillDrawer — url tab", () => {
  it("disables Import from URL until the url is non-empty", () => {
    mockMutate.mockReset();
    render(<AddSkillDrawer onClose={() => {}} initialTab="url" />);

    const importButton = screen.getByRole("button", { name: "Import from URL" });
    expect(importButton).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("https://example.com/skills/security.md"), {
      target: { value: "https://example.com/skill.md" },
    });
    expect(importButton).not.toBeDisabled();
  });

  it("submits the trimmed url + optional name", () => {
    mockMutate.mockReset();
    render(<AddSkillDrawer onClose={() => {}} initialTab="url" />);

    fireEvent.change(screen.getByPlaceholderText("https://example.com/skills/security.md"), {
      target: { value: "  https://example.com/skill.md  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import from URL" }));

    expect(mockMutate).toHaveBeenCalledWith(
      { url: "https://example.com/skill.md", name: undefined },
      expect.any(Object),
    );
  });

  it("shows a pending label while fetching", () => {
    mockMutate.mockReset();
    mockIsPending.current = true;
    render(<AddSkillDrawer onClose={() => {}} initialTab="url" />);
    expect(screen.getByRole("button", { name: "Fetching…" })).toBeInTheDocument();
    mockIsPending.current = false;
  });

  it("switching from the file tab to the url tab via the tab bar shows the url form", () => {
    mockMutate.mockReset();
    render(<AddSkillDrawer onClose={() => {}} />);
    expect(screen.queryByPlaceholderText("https://example.com/skills/security.md")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("From URL"));
    expect(screen.getByPlaceholderText("https://example.com/skills/security.md")).toBeInTheDocument();
  });
});

describe("AddSkillDrawer — community tab", () => {
  it("shows the coming-soon placeholder, no import controls", () => {
    render(<AddSkillDrawer onClose={() => {}} initialTab="community" />);
    expect(screen.getByText("Community skill catalog coming soon.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Import skill" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Import from URL" })).not.toBeInTheDocument();
  });
});
