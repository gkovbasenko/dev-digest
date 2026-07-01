import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { Skill, AgentSkillLink } from "@devdigest/shared";

const { mockMutate, mockIsPending } = vi.hoisted(() => ({
  mockMutate: vi.fn(),
  mockIsPending: { current: false },
}));

vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useSkills: () => ({ data: SKILLS }),
  useAgentSkills: () => ({ data: LINKS }),
  useSetAgentSkills: () => ({ mutate: mockMutate, isPending: mockIsPending.current }),
}));

import { SkillsTab } from "./SkillsTab";

afterEach(cleanup);

const SKILLS: Skill[] = [
  {
    id: "sk-a",
    name: "Skill A",
    description: "",
    type: "custom",
    source: "manual",
    body: "# A",
    enabled: true,
    version: 1,
    evidence_files: null,
  },
  {
    id: "sk-b",
    name: "Skill B",
    description: "",
    type: "custom",
    source: "manual",
    body: "# B",
    enabled: true,
    version: 1,
    evidence_files: null,
  },
];

const LINKS: AgentSkillLink[] = [{ agent_id: "ag1", skill_id: "sk-a", order: 0 }];

/**
 * Regression coverage for the optimistic-rollback fix: SkillsTab updates
 * `localOrder` optimistically before the server confirms, so a failed
 * setAgentSkills mutation must revert it — otherwise the UI keeps showing a
 * link/unlink or reorder that was never actually persisted.
 */
describe("SkillsTab — optimistic rollback on mutation failure", () => {
  it("rolls back an optimistic link when the mutation fails", async () => {
    mockMutate.mockReset();
    mockMutate.mockImplementation((_order: string[], opts?: { onError?: () => void }) => {
      opts?.onError?.();
    });

    render(<SkillsTab agentId="ag1" />);

    // Skill B starts unlinked (unchecked, second checkbox after linked sk-a);
    // linking it optimistically checks it.
    const skillBCheckbox = screen.getAllByRole("checkbox")[1]!;
    fireEvent.click(skillBCheckbox);

    expect(mockMutate).toHaveBeenCalledWith(["sk-a", "sk-b"], expect.any(Object));

    // The mutate mock synchronously invoked onError, so the optimistic add
    // must already be rolled back: "1 of 2 enabled" (back to just sk-a), not 2.
    await waitFor(() => {
      expect(screen.getByText("1 of 2 enabled")).toBeInTheDocument();
    });
  });

  it("keeps the optimistic order when the mutation succeeds", async () => {
    mockMutate.mockReset();
    mockMutate.mockImplementation(() => {});

    render(<SkillsTab agentId="ag1" />);
    const skillBCheckbox = screen.getAllByRole("checkbox")[1]!;
    fireEvent.click(skillBCheckbox);

    expect(screen.getByText("2 of 2 enabled")).toBeInTheDocument();
  });

  it("does not show a just-linked skill in both the linked and unlinked lists during the optimistic window", () => {
    // linkedIds must be derived from localOrder (optimistic), not from the
    // server-truth linkedLinks — otherwise, before the mutation resolves, a
    // just-linked skill appears in BOTH lists (checked AND unchecked) at once.
    mockMutate.mockReset();
    mockMutate.mockImplementation(() => {}); // never resolves — stays in the optimistic window

    render(<SkillsTab agentId="ag1" />);
    fireEvent.click(screen.getAllByRole("checkbox")[1]!); // link Skill B

    expect(screen.getAllByText("Skill B")).toHaveLength(1);
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
  });

  it("does not start a new drag gesture (and so never fires a second mutation) while a mutation is already pending", () => {
    mockMutate.mockReset();
    mockIsPending.current = true;

    render(<SkillsTab agentId="ag1" />);
    const linkedRow = screen.getByText("Skill A").closest("[draggable]")!;

    fireEvent.dragStart(linkedRow);
    fireEvent.dragEnd(linkedRow);

    expect(mockMutate).not.toHaveBeenCalled();
    mockIsPending.current = false;
  });
});
