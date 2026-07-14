import { describe, it, expect } from 'vitest';
import type { FindingRow } from '../src/db/rows.js';
import { assembleMultiAgentRun } from '../src/modules/reviews/multi-agent/assemble.js';
import type { GroupRunRow } from '../src/modules/reviews/repository/multi-agent.repo.js';

function findingRow(over: Partial<FindingRow> & { id: string; reviewId: string }): FindingRow {
  return {
    file: 'src/db.ts',
    startLine: 10,
    endLine: 12,
    severity: 'CRITICAL',
    category: 'security',
    title: 'SQL injection risk',
    rationale: 'Untrusted input is interpolated directly into a SQL query.',
    suggestion: null,
    confidence: 0.9,
    kind: 'finding',
    trifectaComponents: null,
    acceptedAt: null,
    dismissedAt: null,
    ...over,
  };
}

function runRow(over: Partial<GroupRunRow> & { runId: string; agentId: string }): GroupRunRow {
  return {
    agentName: 'General reviewer',
    provider: 'openai',
    model: 'gpt-4.1',
    status: 'done',
    durationMs: 1000,
    tokensIn: 100,
    tokensOut: 50,
    reviewId: null,
    verdict: null,
    summary: null,
    score: null,
    ...over,
  };
}

const GROUP = { id: 'group-1', prId: 'pr-1', ranAt: new Date('2026-07-13T00:00:00.000Z') };

describe('assembleMultiAgentRun (T6)', () => {
  it('maps a DB status of cancelled to AgentColumn.status "failed" (no cancelled member in the contract)', () => {
    const runs: GroupRunRow[] = [runRow({ runId: 'run-1', agentId: 'agent-1', status: 'cancelled' })];
    const result = assembleMultiAgentRun(GROUP, 42, runs, new Map());

    expect(result.columns).toHaveLength(1);
    expect(result.columns[0]!.status).toBe('failed');
  });

  it('passes through done/running statuses unchanged', () => {
    const runs: GroupRunRow[] = [
      runRow({ runId: 'run-1', agentId: 'agent-1', status: 'done' }),
      runRow({ runId: 'run-2', agentId: 'agent-2', status: 'running' }),
      runRow({ runId: 'run-3', agentId: 'agent-3', status: 'failed' }),
    ];
    const result = assembleMultiAgentRun(GROUP, null, runs, new Map());

    expect(result.columns.map((c) => c.status)).toEqual(['done', 'running', 'failed']);
  });

  it('cost_usd is null-safe: unpriced model -> null, and total_cost_usd sums only known costs', () => {
    const runs: GroupRunRow[] = [
      runRow({ runId: 'run-1', agentId: 'agent-1', model: 'gpt-4.1', tokensIn: 1000, tokensOut: 500 }),
      runRow({ runId: 'run-2', agentId: 'agent-2', model: 'unpriced-model-xyz', tokensIn: 1000, tokensOut: 500 }),
    ];
    const result = assembleMultiAgentRun(GROUP, null, runs, new Map());

    expect(result.columns[0]!.cost_usd).not.toBeNull();
    expect(result.columns[1]!.cost_usd).toBeNull();
    // total is the sum of ONLY the known cost, not null/NaN.
    expect(result.total_cost_usd).toBe(result.columns[0]!.cost_usd);
  });

  it('total_cost_usd is null when every column is unpriced/unknown', () => {
    const runs: GroupRunRow[] = [
      runRow({ runId: 'run-1', agentId: 'agent-1', model: 'unpriced-model-xyz' }),
    ];
    const result = assembleMultiAgentRun(GROUP, null, runs, new Map());

    expect(result.total_cost_usd).toBeNull();
  });

  it('total_duration_ms sums each run\'s own duration (0 for not-yet-finished runs)', () => {
    const runs: GroupRunRow[] = [
      runRow({ runId: 'run-1', agentId: 'agent-1', durationMs: 1200 }),
      runRow({ runId: 'run-2', agentId: 'agent-2', durationMs: null, status: 'running' }),
      runRow({ runId: 'run-3', agentId: 'agent-3', durationMs: 800 }),
    ];
    const result = assembleMultiAgentRun(GROUP, null, runs, new Map());

    expect(result.total_duration_ms).toBe(2000);
    expect(result.agent_count).toBe(3);
  });

  it('attaches each run\'s findings (scoped by review_id) to its own column and to the conflict matcher', () => {
    const runs: GroupRunRow[] = [
      runRow({
        runId: 'run-1',
        agentId: 'agent-1',
        agentName: 'Security reviewer',
        reviewId: 'review-1',
        verdict: 'request_changes',
        summary: 'Found issues',
        score: 40,
      }),
      runRow({
        runId: 'run-2',
        agentId: 'agent-2',
        agentName: 'Quality reviewer',
        reviewId: 'review-2',
      }),
    ];
    const findingsByReviewId = new Map<string, FindingRow[]>([
      [
        'review-1',
        [
          findingRow({
            id: 'f1',
            reviewId: 'review-1',
            title: 'SQL injection risk in query builder',
            rationale: 'Untrusted input is interpolated directly into a SQL query.',
            file: 'src/db.ts',
            startLine: 10,
            endLine: 12,
          }),
        ],
      ],
      [
        'review-2',
        [
          findingRow({
            id: 'f2',
            reviewId: 'review-2',
            severity: 'WARNING',
            title: 'Possible SQL injection vulnerability in query builder',
            rationale: 'User input flows into a SQL query without parameterization.',
            file: 'src/db.ts',
            startLine: 11,
            endLine: 11,
          }),
        ],
      ],
    ]);

    const result = assembleMultiAgentRun(GROUP, 7, runs, findingsByReviewId);

    expect(result.columns[0]!.findings.map((f) => f.id)).toEqual(['f1']);
    expect(result.columns[0]!.agent_id).toBe('agent-1');
    expect(result.columns[1]!.findings.map((f) => f.id)).toEqual(['f2']);
    // AC-33: attribution flows through to the conflict takes' agent_id too.
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]!.takes.map((t) => t.agent_id)).toEqual(['agent-1', 'agent-2']);
    expect(result.pr_number).toBe(7);
    expect(result.id).toBe(GROUP.id);
    expect(result.pr_id).toBe(GROUP.prId);
  });

  it('a run with no review yet (still running) contributes no findings and no conflict take', () => {
    const runs: GroupRunRow[] = [runRow({ runId: 'run-1', agentId: 'agent-1', status: 'running', reviewId: null })];
    const result = assembleMultiAgentRun(GROUP, null, runs, new Map());

    expect(result.columns[0]!.findings).toEqual([]);
    expect(result.conflicts).toEqual([]);
  });
});
