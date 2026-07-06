/**
 * Wait-with-timeout polling loop for a single triggered review run.
 *
 * `POST /pulls/:id/review` is fire-and-forget — it returns immediately with
 * `reviews: []` (`server/src/modules/reviews/service.ts:145`). Findings only
 * become available once the background run finishes, so `run_review` polls
 * `GET /pulls/:id/runs` and waits for the SPECIFIC `run_id` it obtained from
 * the POST to reach a terminal status. Backoff starts at ~1s and grows to a
 * ~5s cap; polling stops after `waitTimeoutMs` with a graceful
 * `still-running` outcome rather than an error or an indefinite hang.
 */
import { apiClient } from '../api-client.js';
import { config } from '../config.js';
import type { RunLite } from '../types.js';

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 5_000;
const BACKOFF_MULTIPLIER = 1.5;

export interface WaitDone {
  outcome: 'done' | 'failed' | 'cancelled';
  run: RunLite;
}

export interface WaitStillRunning {
  outcome: 'still-running';
}

export interface WaitError {
  outcome: 'error';
  error: string;
}

export type WaitResult = WaitDone | WaitStillRunning | WaitError;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll `GET /pulls/:prId/runs` until the run identified by `runId` reaches a
 * terminal status (`done|failed|cancelled`), or `waitTimeoutMs` elapses.
 * Never throws — network/HTTP failures surface as `{ outcome: 'error' }` so
 * the caller can decide how to report them.
 */
export async function waitForRun(
  prId: string,
  runId: string,
  waitTimeoutMs: number = config.waitTimeoutMs,
): Promise<WaitResult> {
  const deadline = Date.now() + waitTimeoutMs;
  let backoffMs = INITIAL_BACKOFF_MS;

  while (true) {
    const res = await apiClient.get<RunLite[]>(`/pulls/${prId}/runs`);
    if (!res.ok) {
      return { outcome: 'error', error: res.error };
    }

    const run = res.data.find((r) => r.run_id === runId);
    if (run && (run.status === 'done' || run.status === 'failed' || run.status === 'cancelled')) {
      return { outcome: run.status, run };
    }

    if (Date.now() >= deadline) {
      return { outcome: 'still-running' };
    }

    const remaining = deadline - Date.now();
    await sleep(Math.min(backoffMs, remaining));
    backoffMs = Math.min(backoffMs * BACKOFF_MULTIPLIER, MAX_BACKOFF_MS);
  }
}
