/**
 * `run_review` — outcome-oriented flow: resolve x3 -> POST trigger -> wait
 * for the run -> done/timeout/failed/cancelled branches (plan's `run_review`
 * flow + T3/T5). The timeout test shrinks `config.waitTimeoutMs` so the
 * backoff loop in `wait-for-run.ts` resolves quickly instead of waiting the
 * real 120s default.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { config } from '../src/config.js';
import { runReviewTool } from '../src/tools/run-review.js';
import { AGENTS_FIXTURE, PULLS_FIXTURE, REPOS_FIXTURE, reviewForRun, runSummary, triggerReviewResponse } from './fixtures.js';
import { get, mockFetch, post } from './mock-fetch.js';

const REPO = 'acme/widgets';
const PR = 42;
const AGENT = 'security-reviewer';
const RUN_ID = 'run-review-1';

function parse(result: Awaited<ReturnType<typeof runReviewTool.handler>>): any {
  return JSON.parse(result.content[0]!.text);
}

function resolverRoutes() {
  return [
    get('/repos', REPOS_FIXTURE),
    get('/repos/repo-1/pulls', PULLS_FIXTURE),
    get('/agents', AGENTS_FIXTURE),
  ];
}

const originalWaitTimeoutMs = config.waitTimeoutMs;

afterEach(() => {
  config.waitTimeoutMs = originalWaitTimeoutMs;
  vi.unstubAllGlobals();
});

describe('run_review', () => {
  it('done: returns { verdict, score, findings } for the triggered run_id', async () => {
    mockFetch([
      ...resolverRoutes(),
      post('/pulls/pr-42/review', triggerReviewResponse(RUN_ID, 'agent-1', 'security-reviewer')),
      get('/pulls/pr-42/runs', [runSummary({ run_id: RUN_ID, status: 'done' })]),
      get('/pulls/pr-42/reviews', reviewForRun(RUN_ID, { verdict: 'comment', score: 77 })),
    ]);

    const result = await runReviewTool.handler({ repo: REPO, pr: PR, agent: AGENT });
    expect(result.isError).toBeUndefined();

    const body = parse(result);
    expect(body.verdict).toBe('comment');
    expect(body.score).toBe(77);
    expect(body.findings).toHaveLength(1);
    expect(body.findings[0].title).toBe('Off-by-one in pagination');
  });

  it("timeout: returns { runId, status: 'running', hint } without erroring", async () => {
    config.waitTimeoutMs = 30; // short-circuit the real 120s default for this test

    mockFetch([
      ...resolverRoutes(),
      post('/pulls/pr-42/review', triggerReviewResponse(RUN_ID, 'agent-1', 'security-reviewer')),
      // Always still-running -> waitForRun must hit the timeout branch.
      get('/pulls/pr-42/runs', [runSummary({ run_id: RUN_ID, status: 'running' })]),
    ]);

    const result = await runReviewTool.handler({ repo: REPO, pr: PR, agent: AGENT });
    expect(result.isError).toBeUndefined();

    const body = parse(result);
    expect(body).toEqual({
      runId: RUN_ID,
      status: 'running',
      hint: `call get_findings later with pr=${PR}`,
    });
  });

  it('failed: error-forwards, naming get_findings', async () => {
    mockFetch([
      ...resolverRoutes(),
      post('/pulls/pr-42/review', triggerReviewResponse(RUN_ID, 'agent-1', 'security-reviewer')),
      get('/pulls/pr-42/runs', [
        runSummary({ run_id: RUN_ID, status: 'failed', error: 'LLM request timed out' }),
      ]),
    ]);

    const result = await runReviewTool.handler({ repo: REPO, pr: PR, agent: AGENT });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain(RUN_ID);
    expect(result.content[0]!.text).toContain('failed');
    expect(result.content[0]!.text).toContain('LLM request timed out');
    expect(result.content[0]!.text).toContain(`get_findings`);
    expect(result.content[0]!.text).toContain(`pr=${PR}`);
  });

  it('cancelled: error-forwards, naming get_findings', async () => {
    mockFetch([
      ...resolverRoutes(),
      post('/pulls/pr-42/review', triggerReviewResponse(RUN_ID, 'agent-1', 'security-reviewer')),
      get('/pulls/pr-42/runs', [runSummary({ run_id: RUN_ID, status: 'cancelled' })]),
    ]);

    const result = await runReviewTool.handler({ repo: REPO, pr: PR, agent: AGENT });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain(RUN_ID);
    expect(result.content[0]!.text).toContain('cancelled');
    expect(result.content[0]!.text).toContain('get_findings');
  });

  it('rate-limited trigger (429) surfaces an actionable message', async () => {
    mockFetch([
      ...resolverRoutes(),
      () => new Response('rate limited', { status: 429 }),
    ]);

    const result = await runReviewTool.handler({ repo: REPO, pr: PR, agent: AGENT });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('rate-limited');
  });
});
