import { describe, it, expect } from "vitest";
import type { Conflict } from "@devdigest/shared";
import { collectConflictAgents, isDivergentConflict } from "./helpers";

function conflict(takes: Conflict["takes"], overrides: Partial<Conflict> = {}): Conflict {
  return { file: "src/a.ts", line: 10, title: "Something", takes, ...overrides };
}

describe("collectConflictAgents", () => {
  it("returns one column per distinct agent, first-seen order", () => {
    const conflicts: Conflict[] = [
      conflict([
        { agent_id: "a1", persona: "Security", verdict: "CRITICAL", note: "n1" },
        { agent_id: "a2", persona: "Perf", verdict: "ignored", note: "n2" },
      ]),
      conflict([
        { agent_id: "a2", persona: "Perf", verdict: "ignored", note: "n2" },
        { agent_id: "a3", persona: "Style", verdict: "WARNING", note: "n3" },
      ]),
    ];
    expect(collectConflictAgents(conflicts)).toEqual([
      { agentId: "a1", persona: "Security" },
      { agentId: "a2", persona: "Perf" },
      { agentId: "a3", persona: "Style" },
    ]);
  });

  it("returns an empty list for no conflicts", () => {
    expect(collectConflictAgents([])).toEqual([]);
  });
});

describe("isDivergentConflict", () => {
  it("is true when at least one agent flagged and at least one ignored", () => {
    const c = conflict([
      { agent_id: "a1", persona: "Security", verdict: "CRITICAL", note: "n1" },
      { agent_id: "a2", persona: "Perf", verdict: "ignored", note: "n2" },
    ]);
    expect(isDivergentConflict(c)).toBe(true);
  });

  it("is true when all flagged but severities diverge", () => {
    const c = conflict([
      { agent_id: "a1", persona: "Security", verdict: "CRITICAL", note: "n1" },
      { agent_id: "a2", persona: "Perf", verdict: "WARNING", note: "n2" },
    ]);
    expect(isDivergentConflict(c)).toBe(true);
  });

  it("is false when all agents agree on the same severity (unanimous)", () => {
    const c = conflict([
      { agent_id: "a1", persona: "Security", verdict: "CRITICAL", note: "n1" },
      { agent_id: "a2", persona: "Perf", verdict: "CRITICAL", note: "n2" },
    ]);
    expect(isDivergentConflict(c)).toBe(false);
  });

  it("is false when every agent ignored the location", () => {
    const c = conflict([
      { agent_id: "a1", persona: "Security", verdict: "ignored", note: "n1" },
      { agent_id: "a2", persona: "Perf", verdict: "ignored", note: "n2" },
    ]);
    expect(isDivergentConflict(c)).toBe(false);
  });
});
