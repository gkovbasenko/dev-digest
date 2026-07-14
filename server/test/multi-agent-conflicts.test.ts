import { describe, it, expect } from 'vitest';
import type { Finding } from '@devdigest/shared';
import { computeConflicts, type AgentReviewResult } from '../src/modules/reviews/multi-agent/conflicts.js';

/** Minimal Finding fixture — only the fields the matcher reads matter. */
function finding(over: Partial<Finding> = {}): Finding {
  return {
    id: over.id ?? 'f1',
    severity: 'CRITICAL',
    category: 'security',
    title: 'SQL injection risk',
    file: 'src/db.ts',
    start_line: 10,
    end_line: 12,
    rationale: 'Untrusted input is interpolated directly into a SQL query.',
    confidence: 0.9,
    ...over,
  };
}

function agent(over: Partial<AgentReviewResult> & { agentId: string }): AgentReviewResult {
  return {
    persona: over.persona ?? 'General reviewer',
    status: 'done',
    findings: [],
    ...over,
  };
}

describe('computeConflicts (AC-19..AC-22)', () => {
  it('overlapping + similar findings from two agents merge into 1 Conflict with 2 takes', () => {
    const agents: AgentReviewResult[] = [
      agent({
        agentId: 'agent-1',
        persona: 'Security reviewer',
        findings: [
          finding({
            id: 'f1',
            severity: 'CRITICAL',
            title: 'SQL injection risk in query builder',
            rationale: 'Untrusted input is interpolated directly into a SQL query.',
            file: 'src/db.ts',
            start_line: 10,
            end_line: 12,
          }),
        ],
      }),
      agent({
        agentId: 'agent-2',
        persona: 'Quality reviewer',
        findings: [
          finding({
            id: 'f2',
            severity: 'WARNING',
            title: 'Possible SQL injection vulnerability in query builder',
            rationale: 'User input flows into a SQL query without parameterization.',
            file: 'src/db.ts',
            start_line: 11,
            end_line: 11,
          }),
        ],
      }),
    ];

    const conflicts = computeConflicts(agents);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].file).toBe('src/db.ts');
    expect(conflicts[0].takes).toHaveLength(2);
    expect(conflicts[0].takes.map((t) => t.verdict)).toEqual(['CRITICAL', 'WARNING']);
    expect(conflicts[0].takes.map((t) => t.agent_id)).toEqual(['agent-1', 'agent-2']);
  });

  it('findings in different files never merge — each becomes its own Conflict', () => {
    const agents: AgentReviewResult[] = [
      agent({
        agentId: 'agent-1',
        findings: [finding({ id: 'f1', file: 'src/a.ts', start_line: 5, end_line: 5, title: 'Issue A' })],
      }),
      agent({
        agentId: 'agent-2',
        findings: [finding({ id: 'f2', file: 'src/b.ts', start_line: 5, end_line: 5, title: 'Issue B' })],
      }),
    ];

    const conflicts = computeConflicts(agents);

    expect(conflicts).toHaveLength(2);
    const files = conflicts.map((c) => c.file).sort();
    expect(files).toEqual(['src/a.ts', 'src/b.ts']);
    // Each conflict has 2 takes: the flagging agent + the other agent marked ignored.
    for (const c of conflicts) {
      expect(c.takes).toHaveLength(2);
      const ignored = c.takes.filter((t) => t.verdict === 'ignored');
      expect(ignored).toHaveLength(1);
    }
  });

  it('one CRITICAL flag + two agents that did not flag it -> takes [CRITICAL, ignored, ignored]', () => {
    const agents: AgentReviewResult[] = [
      agent({
        agentId: 'agent-1',
        persona: 'Security reviewer',
        findings: [
          finding({
            id: 'f1',
            severity: 'CRITICAL',
            file: 'src/auth.ts',
            start_line: 20,
            end_line: 20,
            title: 'Broken auth check',
          }),
        ],
      }),
      agent({ agentId: 'agent-2', persona: 'Quality reviewer', findings: [] }),
      agent({ agentId: 'agent-3', persona: 'Perf reviewer', findings: [] }),
    ];

    const conflicts = computeConflicts(agents);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].takes.map((t) => t.verdict)).toEqual(['CRITICAL', 'ignored', 'ignored']);
    expect(conflicts[0].takes.map((t) => t.agent_id)).toEqual(['agent-1', 'agent-2', 'agent-3']);
  });

  it('a failed agent is completely absent from takes (not even as "ignored")', () => {
    const agents: AgentReviewResult[] = [
      agent({
        agentId: 'agent-1',
        findings: [
          finding({ id: 'f1', severity: 'CRITICAL', file: 'src/auth.ts', start_line: 20, end_line: 20 }),
        ],
      }),
      agent({ agentId: 'agent-2', findings: [] }),
      { agentId: 'agent-3', persona: 'Failed reviewer', status: 'failed', findings: [] },
    ];

    const conflicts = computeConflicts(agents);

    expect(conflicts).toHaveLength(1);
    const agentIds = conflicts[0].takes.map((t) => t.agent_id);
    expect(agentIds).not.toContain('agent-3');
    expect(agentIds).toEqual(['agent-1', 'agent-2']);
  });

  it('no findings from any done agent -> []', () => {
    const agents: AgentReviewResult[] = [
      agent({ agentId: 'agent-1', findings: [] }),
      agent({ agentId: 'agent-2', findings: [] }),
    ];

    expect(computeConflicts(agents)).toEqual([]);
  });

  it('all done agents unanimously agree (same location, same severity) -> not a conflict', () => {
    const agents: AgentReviewResult[] = [
      agent({
        agentId: 'agent-1',
        findings: [
          finding({
            id: 'f1',
            severity: 'WARNING',
            title: 'Missing null check',
            rationale: 'The value can be null here and is dereferenced without a guard.',
            file: 'src/util.ts',
            start_line: 30,
            end_line: 30,
          }),
        ],
      }),
      agent({
        agentId: 'agent-2',
        findings: [
          finding({
            id: 'f2',
            severity: 'WARNING',
            title: 'Missing null check on value',
            rationale: 'The value could be null here and is dereferenced without a guard.',
            file: 'src/util.ts',
            start_line: 30,
            end_line: 30,
          }),
        ],
      }),
    ];

    expect(computeConflicts(agents)).toEqual([]);
  });

  it('an agent with no `done` status contributes no findings at all', () => {
    const agents: AgentReviewResult[] = [
      { agentId: 'agent-1', persona: 'p', status: 'running', findings: [finding({ id: 'f1' })] },
    ];

    expect(computeConflicts(agents)).toEqual([]);
  });
});
