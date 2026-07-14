import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/runs.json";

// Stable, module-scoped agent list — a fresh array literal per call can send a
// component's effects into an infinite render loop and OOM the worker (client
// INSIGHTS 2026-07-01). MultiAgentPicker has no effect keyed on this data, but
// keep the same stable-reference discipline as the rest of the codebase.
const AGENTS = [
  { id: "a1", name: "Security", model: "gpt-4.1", enabled: true },
  { id: "a2", name: "Performance", model: "gpt-4.1", enabled: true },
  { id: "a3", name: "General", model: "gpt-4.1", enabled: true },
];

const mutate = vi.fn();

vi.mock("../../../../../../../lib/hooks/agents", () => ({
  useAgents: () => ({ data: AGENTS }),
}));
vi.mock("../../../../../../../lib/hooks/multi-agent", () => ({
  useMultiAgentRun: () => ({ mutate, isPending: false }),
}));
// Defensive: the legacy review hook must never be imported/called by this
// component — if it ever is, this mock throws instead of silently no-oping.
vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useRunReview: () => {
    throw new Error("MultiAgentPicker must not use the legacy useRunReview hook");
  },
}));

import { MultiAgentPicker } from "./MultiAgentPicker";

afterEach(() => {
  cleanup();
  mutate.mockReset();
});

function renderPicker(props: Partial<React.ComponentProps<typeof MultiAgentPicker>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <MultiAgentPicker prId="pr1" {...props} />
    </NextIntlClientProvider>,
  );
}

describe("MultiAgentPicker", () => {
  it("shows one checkbox per enabled agent and enables the confirm action only once agents are checked", () => {
    renderPicker();

    fireEvent.click(screen.getByRole("button", { name: /pick agents to run/i }));

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(3);

    const confirmButton = screen.getByRole("button", { name: /run multi-agent review \(0\)/i });
    expect(confirmButton).toBeDisabled();

    fireEvent.click(checkboxes.at(0)!);
    fireEvent.click(checkboxes.at(1)!);

    expect(screen.getByRole("button", { name: /run multi-agent review \(2\)/i })).toBeEnabled();
  });

  it("confirming fires exactly one multi-agent-run mutate call with the checked agentIds", () => {
    renderPicker();

    fireEvent.click(screen.getByRole("button", { name: /pick agents to run/i }));
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes.at(0)!);
    fireEvent.click(checkboxes.at(2)!);

    fireEvent.click(screen.getByRole("button", { name: /run multi-agent review \(2\)/i }));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith(
      { prId: "pr1", agentIds: ["a1", "a3"] },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });
});
