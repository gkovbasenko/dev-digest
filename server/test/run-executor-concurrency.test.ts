import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reviewPullRequest, type ReviewInput, type ReviewOutcome } from '@devdigest/reviewer-core';
import { ReviewRunExecutor, DEFAULT_MULTI_AGENT_CONCURRENCY } from '../src/modules/reviews/run-executor.js';
import { RunBus } from '../src/platform/sse.js';
import type { Container } from '../src/platform/container.js';
import type { ReviewRepository, PullRow } from '../src/modules/reviews/repository.js';
import type { AgentRow } from '../src/db/rows.js';

/**
 * T4 — bounded-concurrency pool coverage: at no point more than N jobs
 * in-flight; with M>N jobs later ones start only once a slot frees; and a
 * per-agent failure is isolated (other jobs persist normally, the failed run
 * is recorded `status='failed'` + error) — the pool must not stop on a
 * rejection.
 *
 * `reviewPullRequest` (the reviewer-core engine call) is mocked so the test
 * controls exactly when each "agent run" resolves/rejects and can observe
 * in-flight counts — `runOneAgent`'s own logic is untouched (out of scope).
 */

vi.mock('@devdigest/reviewer-core', () => ({
  reviewPullRequest: vi.fn(),
  countBlockers: () => 0,
}));

const reviewPullRequestMock = vi.mocked(reviewPullRequest);

function fakeReviewOutcome(): ReviewOutcome {
  return {
    review: { verdict: 'approve', summary: 'ok', score: 90, findings: [] },
    grounding: '0/0 passed',
    dropped: [],
    mode: 'single-pass',
    assembly: { system: '', skills: null, memory: null, specs: null, user: '' },
    chunks: [],
    tokensIn: 10,
    tokensOut: 5,
    costUsd: null,
    raw: '',
  };
}

/** Extract the agent name embedded in `sessionId` (`owner/name#42:AgentName`). */
function agentNameFromInput(input: ReviewInput): string {
  return (input.sessionId ?? '').split(':').pop() ?? '';
}

type PoolEvent = { type: 'start' | 'end'; agent: string };

/**
 * Wires the mocked `reviewPullRequest` to: track concurrent in-flight calls
 * (via a chronological start/end event log), wait `delayMs` before settling
 * (so multiple jobs are genuinely concurrent, not resolved synchronously),
 * and reject for any agent name in `failing`.
 */
function instrumentReviewPullRequest(opts: { delayMs: number; failing?: Set<string> }) {
  const events: PoolEvent[] = [];
  const failing = opts.failing ?? new Set<string>();
  reviewPullRequestMock.mockImplementation(async (input: ReviewInput) => {
    const agent = agentNameFromInput(input);
    events.push({ type: 'start', agent });
    try {
      await new Promise((resolve) => setTimeout(resolve, opts.delayMs));
      if (failing.has(agent)) throw new Error(`boom-${agent}`);
      return fakeReviewOutcome();
    } finally {
      events.push({ type: 'end', agent });
    }
  });
  return events;
}

/** Max concurrently-active calls implied by a chronological start/end log. */
function maxConcurrent(events: PoolEvent[]): number {
  let active = 0;
  let max = 0;
  for (const e of events) {
    if (e.type === 'start') {
      active++;
      max = Math.max(max, active);
    } else {
      active--;
    }
  }
  return max;
}

function fakePull(overrides: Partial<PullRow> = {}): PullRow {
  return {
    id: 'pr-1',
    workspaceId: 'ws-1',
    repoId: 'repo-1',
    number: 42,
    title: 'Multi-agent test PR',
    author: 'octocat',
    branch: 'feature/x',
    base: 'main',
    headSha: 'sha123',
    lastReviewedSha: null,
    additions: 1,
    deletions: 0,
    filesCount: 0,
    status: 'needs_review',
    body: null,
    openedAt: null,
    updatedAt: null,
    ...overrides,
  } as PullRow;
}

function fakeRepoRow() {
  return {
    id: 'repo-1',
    workspaceId: 'ws-1',
    owner: 'acme',
    name: 'widgets',
    fullName: 'acme/widgets',
    defaultBranch: 'main',
    clonePath: null,
    lastPolledAt: null,
    createdBy: null,
    createdAt: null,
  };
}

function fakeAgent(name: string, overrides: Partial<AgentRow> = {}): AgentRow {
  return {
    id: `agent-${name}`,
    workspaceId: 'ws-1',
    name,
    description: '',
    provider: 'openrouter',
    model: 'deepseek/deepseek-v4-flash',
    systemPrompt: 'Review the diff.',
    outputSchema: null,
    strategy: 'single-pass',
    ciFailOn: 'critical',
    // Skip repo-intel enrichment entirely — keeps the fake container minimal
    // (no container.repoIntel needed) without touching runOneAgent's logic.
    repoIntel: false,
    enabled: true,
    version: 1,
    createdBy: null,
    createdAt: null,
    ...overrides,
  } as AgentRow;
}

/** Minimal container exposing only what the (mocked-reviewer-core) path touches. */
function fakeContainer(runBus: RunBus): Container {
  return {
    runBus,
    git: { diff: async () => { throw new Error('no clone in test'); } },
    llm: async () => ({}) as unknown,
  } as unknown as Container;
}

type CompleteCall = { runId: string; status: string; error: string | null };

/** Minimal ReviewRepository stub; records `completeAgentRun`/`saveRunTrace` calls. */
function fakeRepo() {
  const completeCalls: CompleteCall[] = [];
  const savedTraceRunIds: string[] = [];
  const repo = {
    getPrFiles: async () => [],
    getIntent: async () => {
      throw new Error('no intent in test — falls back to "no intent" path');
    },
    getEnabledAgentSkills: async () => [],
    getAgentContextDocs: async () => [],
    getSkillContextDocs: async () => [],
    insertReview: async (values: Record<string, unknown>) =>
      ({ id: `review-${String(values.runId)}`, ...values }) as unknown,
    insertFindings: async () => [],
    markReviewed: async () => undefined,
    completeAgentRun: async (runId: string, values: { status: string; error: string | null }) => {
      completeCalls.push({ runId, status: values.status, error: values.error });
    },
    saveRunTrace: async (runId: string) => {
      savedTraceRunIds.push(runId);
    },
  } as unknown as ReviewRepository;
  return { repo, completeCalls, savedTraceRunIds };
}

describe('ReviewRunExecutor.executeRuns — bounded-concurrency pool', () => {
  let runBus: RunBus;

  beforeEach(() => {
    runBus = new RunBus();
    reviewPullRequestMock.mockReset();
  });

  it('exports a sane default concurrency (3–4, per spec)', () => {
    expect(DEFAULT_MULTI_AGENT_CONCURRENCY).toBeGreaterThanOrEqual(3);
    expect(DEFAULT_MULTI_AGENT_CONCURRENCY).toBeLessThanOrEqual(4);
  });

  it('never runs more than N jobs concurrently, and starts the next job only once a slot frees (M > N)', async () => {
    const concurrency = 2;
    const jobNames = ['A', 'B', 'C', 'D', 'E'];
    const events = instrumentReviewPullRequest({ delayMs: 20 });

    const executor = new ReviewRunExecutor(fakeContainer(runBus), fakeRepo().repo, {} as never);
    const jobs = jobNames.map((name) => ({ agent: fakeAgent(name), runId: `run-${name}` }));

    await executor.executeRuns('ws-1', fakePull(), fakeRepoRow() as never, jobs, undefined, concurrency);

    // Every job actually ran (isolation didn't drop any).
    expect(reviewPullRequestMock).toHaveBeenCalledTimes(jobNames.length);
    // The pool never exceeded the configured limit, and reached it (not
    // silently under-parallelizing to 1) since jobs.length > concurrency.
    expect(maxConcurrent(events)).toBe(concurrency);
  });

  it('caps in-flight work at concurrency=1 (fully sequential) when configured to 1', async () => {
    const events = instrumentReviewPullRequest({ delayMs: 5 });
    const executor = new ReviewRunExecutor(fakeContainer(runBus), fakeRepo().repo, {} as never);
    const jobs = ['A', 'B', 'C'].map((name) => ({ agent: fakeAgent(name), runId: `run-${name}` }));

    await executor.executeRuns('ws-1', fakePull(), fakeRepoRow() as never, jobs, undefined, 1);

    expect(maxConcurrent(events)).toBe(1);
    expect(reviewPullRequestMock).toHaveBeenCalledTimes(3);
  });

  it('isolates a single agent failure: others still persist `status=done`, the failing one persists `status=failed` + error, and the pool keeps going', async () => {
    const events = instrumentReviewPullRequest({ delayMs: 5, failing: new Set(['B']) });
    const { repo, completeCalls, savedTraceRunIds } = fakeRepo();
    const executor = new ReviewRunExecutor(fakeContainer(runBus), repo, {} as never);
    const jobs = ['A', 'B', 'C'].map((name) => ({ agent: fakeAgent(name), runId: `run-${name}` }));

    await executor.executeRuns('ws-1', fakePull(), fakeRepoRow() as never, jobs, undefined, 3);

    // Isolation: every job reaches completeAgentRun exactly once — a
    // rejection from one agent never aborts (or double-counts) another.
    expect(completeCalls).toHaveLength(3);
    expect(reviewPullRequestMock).toHaveBeenCalledTimes(3);

    const byRunId = new Map(completeCalls.map((c) => [c.runId, c]));
    expect(byRunId.get('run-A')).toMatchObject({ status: 'done', error: null });
    expect(byRunId.get('run-C')).toMatchObject({ status: 'done', error: null });
    expect(byRunId.get('run-B')).toMatchObject({ status: 'failed', error: 'boom-B' });

    // Failure state (+ trace) is persisted for every run, including the
    // failed one, before the pool moves on.
    expect(savedTraceRunIds.sort()).toEqual(['run-A', 'run-B', 'run-C']);
  });

  it('defaults to DEFAULT_MULTI_AGENT_CONCURRENCY when no explicit limit is passed', async () => {
    const jobNames = ['A', 'B', 'C', 'D', 'E', 'F'];
    const events = instrumentReviewPullRequest({ delayMs: 15 });
    const executor = new ReviewRunExecutor(fakeContainer(runBus), fakeRepo().repo, {} as never);
    const jobs = jobNames.map((name) => ({ agent: fakeAgent(name), runId: `run-${name}` }));

    // No 6th `concurrency` arg — must fall back to the module default.
    await executor.executeRuns('ws-1', fakePull(), fakeRepoRow() as never, jobs, undefined);

    expect(maxConcurrent(events)).toBe(DEFAULT_MULTI_AGENT_CONCURRENCY);
  });
});
