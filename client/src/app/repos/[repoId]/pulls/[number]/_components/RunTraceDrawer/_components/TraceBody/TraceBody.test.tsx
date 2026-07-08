import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunTrace } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/runs.json";
import { TraceBody } from "./TraceBody";

afterEach(cleanup);

/**
 * T12 — Project Context folder: verify TraceBody already renders the
 * attachment-wiring data T6 produces (AC-16/17) with NO logic change needed.
 * `specs_read` (paths + `(missing)` markers) renders as plain strings under
 * "Specs read"; `prompt_assembly.specs` is an expandable block showing the
 * exact injected (untrusted-wrapped) text.
 */
const TRACE: RunTrace = {
  config: { agent: "Context Reviewer", version: "1", provider: "openai", model: "gpt-4.1", pr: 482, source: "local" },
  stats: { duration_ms: 8200, tokens_in: 12000, tokens_out: 1500, findings: 0, grounding: "0/0 passed" },
  prompt_assembly: {
    system: "You are a reviewer.",
    skills: null,
    memory: null,
    repo_map: null,
    callers: null,
    specs:
      '<untrusted source="specs/a.md">\nRule A: no hardcoded secrets.\n</untrusted>\n\n<untrusted source="specs/b.md">\nRule B: use snake_case.\n</untrusted>',
    pr_description: null,
    user: "Review PR #482",
  },
  tool_calls: [],
  raw_output: "",
  memory_pulled: [],
  specs_read: ["specs/a.md", "specs/b.md", "specs/gone.md (missing)"],
  log: [],
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("TraceBody — Project Context (AC-16/17)", () => {
  it("lists attached + missing paths under Specs read", () => {
    renderWithIntl(<TraceBody trace={TRACE} findings={[]} />);
    expect(screen.getByText("specs/a.md")).toBeInTheDocument();
    expect(screen.getByText("specs/b.md")).toBeInTheDocument();
    expect(screen.getByText("specs/gone.md (missing)")).toBeInTheDocument();
  });

  it("expands the Project context prompt block to the exact injected (untrusted-wrapped) text", () => {
    renderWithIntl(<TraceBody trace={TRACE} findings={[]} />);

    // "Prompt assembly" section defaults closed.
    fireEvent.click(screen.getByText("Prompt assembly"));
    // The specs prompt block's own header — click it to expand.
    fireEvent.click(screen.getByText("Project context (dynamic)"));

    expect(screen.getByText(/<untrusted source="specs\/a\.md">/)).toBeInTheDocument();
    expect(screen.getByText(/Rule A: no hardcoded secrets\./)).toBeInTheDocument();
    expect(screen.getByText(/Rule B: use snake_case\./)).toBeInTheDocument();
  });

  it("omits the Specs read row content (shows 'none') and the specs prompt block when nothing was attached", () => {
    const noAttachments: RunTrace = {
      ...TRACE,
      specs_read: [],
      prompt_assembly: { ...TRACE.prompt_assembly, specs: null },
    };
    renderWithIntl(<TraceBody trace={noAttachments} findings={[]} />);
    expect(screen.getByText("none")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Prompt assembly"));
    expect(screen.queryByText("Project context (dynamic)")).not.toBeInTheDocument();
  });
});
