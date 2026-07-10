import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalCase } from "@devdigest/shared";

const { mockUpdateMutate, mockUpdateIsPending, mockRunMutate, mockRunIsPending } = vi.hoisted(() => ({
  mockUpdateMutate: vi.fn(),
  mockUpdateIsPending: { current: false },
  mockRunMutate: vi.fn(),
  mockRunIsPending: { current: false },
}));

vi.mock("@/lib/hooks/eval", () => ({
  useUpdateEvalCase: () => ({ mutate: mockUpdateMutate, isPending: mockUpdateIsPending.current }),
  useRunEvalCase: () => ({ mutate: mockRunMutate, isPending: mockRunIsPending.current }),
}));

import { EvalCaseEditor } from "./EvalCaseEditor";

afterEach(() => {
  cleanup();
  mockUpdateMutate.mockReset();
  mockRunMutate.mockReset();
  mockUpdateIsPending.current = false;
  mockRunIsPending.current = false;
});

const EVAL_CASE: EvalCase = {
  id: "case-1",
  owner_kind: "agent",
  owner_id: "agent-1",
  name: "missing-index-on-fk",
  input_diff: "diff --git a/src/x.ts b/src/x.ts\n+foo",
  input_files: ["src/x.ts"],
  input_meta: { pr_number: 42, pr_title: "Add x", head_sha: "abc123" },
  expected_output: {
    must_find: [
      { file: "src/x.ts", start_line: 1, end_line: 2, severity: "WARNING", category: "bug", title: "Missing index" },
    ],
    must_not_flag: [],
  },
  notes: null,
  source_finding_id: null,
};

function renderEditor(props: Partial<React.ComponentProps<typeof EvalCaseEditor>> = {}) {
  const onClose = props.onClose ?? vi.fn();
  const onSaved = props.onSaved ?? vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{}}>
      <EvalCaseEditor evalCase={props.evalCase ?? EVAL_CASE} onClose={onClose} onSaved={onSaved} />
    </NextIntlClientProvider>,
  );
  return { onClose, onSaved };
}

describe("EvalCaseEditor", () => {
  it("disables Save on an empty name and on invalid expected-output JSON (AC-20)", () => {
    renderEditor();
    const saveButton = screen.getByRole("button", { name: "Save" });
    expect(saveButton).not.toBeDisabled();

    // Empty name -> disabled.
    fireEvent.change(screen.getByPlaceholderText("e.g. missing-index-on-fk"), { target: { value: "   " } });
    expect(saveButton).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("e.g. missing-index-on-fk"), { target: { value: "renamed-case" } });
    expect(saveButton).not.toBeDisabled();

    // Invalid JSON -> disabled + "Invalid" indicator.
    const jsonBox = screen.getByDisplayValue(/must_find/, { normalizer: (s) => s });
    fireEvent.change(jsonBox, { target: { value: "{not valid json" } });
    expect(saveButton).toBeDisabled();
    expect(screen.getByText(/Invalid —/)).toBeInTheDocument();

    // Valid but wrong shape -> still disabled.
    fireEvent.change(jsonBox, { target: { value: JSON.stringify({ foo: "bar" }) } });
    expect(saveButton).toBeDisabled();

    // Back to a valid shape -> re-enabled.
    fireEvent.change(jsonBox, { target: { value: JSON.stringify({ must_find: [], must_not_flag: [] }) } });
    expect(saveButton).not.toBeDisabled();
    expect(screen.getByText("Valid")).toBeInTheDocument();
  });

  it("appends a must_find skeleton row via '+ Finding skeleton'", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "+ Finding skeleton" }));
    const jsonBox = screen.getByDisplayValue(/must_find/, { normalizer: (s) => s }) as HTMLTextAreaElement;
    const parsed = JSON.parse(jsonBox.value);
    expect(parsed.must_find).toHaveLength(2); // 1 pre-filled + 1 skeleton
    expect(parsed.must_find[1]).toMatchObject({ file: "", severity: "WARNING", category: "bug" });
  });

  it("saves without running by default: onSaved + onClose fire, run is never called", () => {
    mockUpdateMutate.mockImplementation((_input, opts) => {
      opts?.onSuccess?.({ ...EVAL_CASE, name: "renamed-case" });
    });
    const { onClose, onSaved } = renderEditor();

    fireEvent.change(screen.getByPlaceholderText("e.g. missing-index-on-fk"), { target: { value: "renamed-case" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(mockUpdateMutate).toHaveBeenCalledWith(
      { id: "case-1", patch: { name: "renamed-case", expected_output: EVAL_CASE.expected_output } },
      expect.any(Object),
    );
    expect(mockRunMutate).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ name: "renamed-case" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("run-on-save renders the pass/fail result strip in place, without closing (AC-21)", () => {
    mockUpdateMutate.mockImplementation((_input, opts) => {
      opts?.onSuccess?.(EVAL_CASE);
    });
    mockRunMutate.mockImplementation((_id, opts) => {
      opts?.onSuccess?.({
        run_id: "run-1",
        result: {
          recall: 1,
          precision: 1,
          citation_accuracy: 1,
          traces_passed: 1,
          traces_total: 1,
          duration_ms: 1234,
          cost_usd: 0.0021,
          case_results: [
            {
              case_id: "case-1",
              name: "missing-index-on-fk",
              pass: true,
              expected: 1,
              got: 1,
              recall: 1,
              precision: 1,
              cost_usd: 0.0021,
              duration_ms: 1234,
              actual: [],
            },
          ],
        },
      });
    });
    const { onClose } = renderEditor();

    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(mockRunMutate).toHaveBeenCalledWith("case-1", expect.any(Object));
    expect(screen.getByText("expected 1 finding, got 1")).toBeInTheDocument();
    expect(screen.getByText("1.2s")).toBeInTheDocument();
    expect(screen.getByText("$0.0021")).toBeInTheDocument();
    expect(screen.getByText("Pass")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
