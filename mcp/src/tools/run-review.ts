/**
 * `run_review` — outcome-oriented tool: trigger a review agent on a PR, wait
 * for it to finish, and return `{ verdict, findings }` in a SINGLE call.
 *
 * `POST /pulls/:id/review` is fire-and-forget (returns immediately with
 * `reviews: []` — `server/src/modules/reviews/service.ts:145`); this tool
 * hides that async shape from the caller via `waitForRun`, matched by the
 * SPECIFIC `run_id` this call obtained from the POST (never "active runs in
 * general" — a PR can have concurrent/prior runs from other agents/calls).
 *
 * Non-read-only, open-world (triggers a paid LLM call) — see
 * `readOnlyHint:false`/`openWorldHint:true` below.
 */
import { z } from 'zod';
import { apiClient } from '../api-client.js';
import { resolveAgent, resolvePr, resolveRepo } from '../resolve.js';
import type { FindingLite, ReviewLite } from '../types.js';
import { errorResult, textResult, type ToolDef, type ToolResult } from './tool.js';
import { waitForRun } from './wait-for-run.js';

const inputSchema = {
  repo: z.string().min(1).describe('Repo full name, "owner/name" (see dev_digest_list_agents/dev_digest_get_conventions for examples).'),
  pr: z.number().int().positive().describe('Pull request number (not the internal id).'),
  agent: z.string().min(1).describe('Review agent name — see dev_digest_list_agents for available names.'),
};

/** Shape of `POST /pulls/:id/review`'s response — only the fields this tool reads. */
interface TriggerReviewResponse {
  runs: { run_id: string; agent_id: string; agent_name: string }[];
}

/** Strip a fetched finding down to the compact, rationale-free projection. */
function pickFinding(f: FindingLite): FindingLite {
  return {
    severity: f.severity,
    title: f.title,
    file: f.file,
    start_line: f.start_line,
    end_line: f.end_line,
    category: f.category,
    confidence: f.confidence,
  };
}

/**
 * A PR can carry multiple review rows (one per agent run — root cause:
 * `server/INSIGHTS.md` 2026-06-30). `run_review` must read back the ONE row
 * matching its own `run_id`, not "the latest review".
 */
async function fetchReviewOutcome(prId: string, runId: string, pr: number): Promise<ToolResult> {
  const res = await apiClient.get<ReviewLite[]>(`/pulls/${prId}/reviews`);
  if (!res.ok) {
    return errorResult(`${res.error} Call dev_digest_get_findings with pr=${pr} to retry the read.`);
  }
  const review = res.data.find((r) => r.run_id === runId);
  if (!review) {
    return errorResult(
      `Review run ${runId} finished but no matching review row was found — call dev_digest_get_findings ` +
        `with pr=${pr} to check again.`,
    );
  }
  return textResult({
    verdict: review.verdict,
    score: review.score,
    findings: review.findings.map(pickFinding),
  });
}

export const runReviewTool: ToolDef<typeof inputSchema> = {
  name: 'dev_digest_run_review',
  description:
    'Run a review agent on a pull request and return the outcome in one call — starts the ' +
    'run, waits for it to finish, and returns { verdict, findings }. Paid LLM call. If it ' +
    "exceeds the wait timeout, returns { status: 'running' } so you can fetch results later " +
    'with dev_digest_get_findings.',
  inputSchema,
  annotations: { readOnlyHint: false, openWorldHint: true },
  handler: async ({ repo, pr, agent }) => {
    const repoResolved = await resolveRepo(repo);
    if (!repoResolved.ok) return errorResult(repoResolved.error);

    const prResolved = await resolvePr(repoResolved.id, pr);
    if (!prResolved.ok) return errorResult(prResolved.error);
    const prId = prResolved.id;

    const agentResolved = await resolveAgent(agent);
    if (!agentResolved.ok) return errorResult(agentResolved.error);

    const triggerRes = await apiClient.post<TriggerReviewResponse>(`/pulls/${prId}/review`, {
      agentId: agentResolved.id,
    });
    if (!triggerRes.ok) {
      if (triggerRes.status === 429) {
        return errorResult('review rate-limited (10/min) — зачекайте і повторіть.');
      }
      return errorResult(triggerRes.error);
    }

    const run = triggerRes.data.runs[0];
    if (!run) {
      return errorResult(
        'dev-digest API accepted the review trigger but returned no run — retry dev_digest_run_review, ' +
          `or call dev_digest_get_findings with pr=${pr} once a run appears.`,
      );
    }

    const wait = await waitForRun(prId, run.run_id);

    switch (wait.outcome) {
      case 'done':
        return fetchReviewOutcome(prId, run.run_id, pr);

      case 'still-running':
        return textResult({
          runId: run.run_id,
          status: 'running',
          hint: `call dev_digest_get_findings later with pr=${pr}`,
        });

      case 'failed':
      case 'cancelled': {
        const detail = wait.run.error ? `: ${wait.run.error}` : '';
        return errorResult(
          `Review run ${run.run_id} ${wait.outcome}${detail} — call dev_digest_get_findings with pr=${pr} ` +
            'to inspect any partial state, or retry dev_digest_run_review.',
        );
      }

      case 'error':
        // The poll loop itself failed (network/HTTP); the underlying run may
        // still be progressing server-side.
        return errorResult(
          `${wait.error} The review run ${run.run_id} may still be in progress — call ` +
            `dev_digest_get_findings later with pr=${pr} to check.`,
        );
    }
  },
};
