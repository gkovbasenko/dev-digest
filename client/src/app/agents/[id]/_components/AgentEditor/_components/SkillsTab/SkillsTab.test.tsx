import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { Skill, AgentSkillLink } from "@devdigest/shared";

const { mockMutate, mockIsPending, mockSkills, mockLinks } = vi.hoisted(() => ({
  mockMutate: vi.fn(),
  mockIsPending: { current: false },
  mockSkills: { current: [] as Skill[] },
  mockLinks: { current: [] as AgentSkillLink[] },
}));

vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useSkills: () => ({ data: mockSkills.current }),
  useAgentSkills: () => ({ data: mockLinks.current }),
  useSetAgentSkills: () => ({ mutate: mockMutate, isPending: mockIsPending.current }),
}));

import { SkillsTab } from "./SkillsTab";

// Single source of truth for resetting mutable mock state between tests —
// previously only the second describe block reset mockSkills/mockLinks (and
// none reset mockIsPending consistently), so a failed or skipped test could
// leave isPending=true (or the wrong skill fixture) leaking into whichever
// test ran next, regardless of which describe block it was in.
afterEach(() => {
  cleanup();
  mockMutate.mockReset();
  mockIsPending.current = false;
  mockSkills.current = SKILLS;
  mockLinks.current = LINKS;
});

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

mockSkills.current = SKILLS;
mockLinks.current = LINKS;

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
  });
});

describe("SkillsTab — filter", () => {
  it("narrows both the linked and unlinked lists to names matching the filter", () => {
    render(<SkillsTab agentId="ag1" />);
    // Default fixture: Skill A is linked, Skill B is unlinked — both visible
    // with no filter applied.
    expect(screen.getByText("Skill A")).toBeInTheDocument();
    expect(screen.getByText("Skill B")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Filter skills…"), { target: { value: "B" } });

    expect(screen.queryByText("Skill A")).not.toBeInTheDocument();
    expect(screen.getByText("Skill B")).toBeInTheDocument();
  });

  it("filter matching is case-insensitive", () => {
    render(<SkillsTab agentId="ag1" />);
    fireEvent.change(screen.getByPlaceholderText("Filter skills…"), { target: { value: "skill b" } });
    expect(screen.queryByText("Skill A")).not.toBeInTheDocument();
    expect(screen.getByText("Skill B")).toBeInTheDocument();
  });

  it("clearing the filter restores both lists", () => {
    render(<SkillsTab agentId="ag1" />);
    const filterInput = screen.getByPlaceholderText("Filter skills…");
    fireEvent.change(filterInput, { target: { value: "B" } });
    expect(screen.queryByText("Skill A")).not.toBeInTheDocument();

    fireEvent.change(filterInput, { target: { value: "" } });
    expect(screen.getByText("Skill A")).toBeInTheDocument();
    expect(screen.getByText("Skill B")).toBeInTheDocument();
  });

  it("shows no rows (but not the 'no skills' empty state) when nothing matches", () => {
    render(<SkillsTab agentId="ag1" />);
    fireEvent.change(screen.getByPlaceholderText("Filter skills…"), { target: { value: "zzz-no-match" } });
    expect(screen.queryByText("Skill A")).not.toBeInTheDocument();
    expect(screen.queryByText("Skill B")).not.toBeInTheDocument();
    expect(screen.queryByText("No skills in this workspace yet.")).not.toBeInTheDocument();
  });
});

/**
 * Move-up/move-down buttons: keyboard/screen-reader-accessible alternative
 * to drag-and-drop reordering (native HTML5 drag has no keyboard path).
 */
describe("SkillsTab — move-up/move-down buttons", () => {
  const THREE_SKILLS: Skill[] = [
    { ...SKILLS[0]!, id: "sk-a", name: "Skill A" },
    { ...SKILLS[0]!, id: "sk-b", name: "Skill B" },
    { ...SKILLS[0]!, id: "sk-c", name: "Skill C" },
  ];
  const THREE_LINKS: AgentSkillLink[] = [
    { agent_id: "ag1", skill_id: "sk-a", order: 0 },
    { agent_id: "ag1", skill_id: "sk-b", order: 1 },
    { agent_id: "ag1", skill_id: "sk-c", order: 2 },
  ];

  it("moves the middle item up, committing the swapped order", () => {
    mockSkills.current = THREE_SKILLS;
    mockLinks.current = THREE_LINKS;
    mockMutate.mockReset();
    mockMutate.mockImplementation(() => {});

    render(<SkillsTab agentId="ag1" />);
    fireEvent.click(screen.getByRole("button", { name: "Move Skill B up" }));

    expect(mockMutate).toHaveBeenCalledWith(["sk-b", "sk-a", "sk-c"], expect.any(Object));
  });

  it("moves the middle item down, committing the swapped order", () => {
    mockSkills.current = THREE_SKILLS;
    mockLinks.current = THREE_LINKS;
    mockMutate.mockReset();
    mockMutate.mockImplementation(() => {});

    render(<SkillsTab agentId="ag1" />);
    fireEvent.click(screen.getByRole("button", { name: "Move Skill B down" }));

    expect(mockMutate).toHaveBeenCalledWith(["sk-a", "sk-c", "sk-b"], expect.any(Object));
  });

  it("disables the up button for the first item and the down button for the last item", () => {
    mockSkills.current = THREE_SKILLS;
    mockLinks.current = THREE_LINKS;
    mockMutate.mockReset();

    render(<SkillsTab agentId="ag1" />);

    expect(screen.getByRole("button", { name: "Move Skill A up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Skill C down" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Skill A down" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Skill C up" })).not.toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Move Skill A up" }));
    fireEvent.click(screen.getByRole("button", { name: "Move Skill C down" }));
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("rolls back the optimistic order if the move mutation fails", async () => {
    mockSkills.current = THREE_SKILLS;
    mockLinks.current = THREE_LINKS;
    mockMutate.mockReset();
    mockMutate.mockImplementation((_order: string[], opts?: { onError?: () => void }) => {
      opts?.onError?.();
    });

    render(<SkillsTab agentId="ag1" />);
    fireEvent.click(screen.getByRole("button", { name: "Move Skill B up" }));

    // After rollback, Skill B's "up" button (now back in the middle slot)
    // should be enabled again, matching the reverted (pre-move) order.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Move Skill A up" })).toBeDisabled();
    });
  });
});
