/**
 * `get_findings` — compact findings for an already-reviewed pull request.
 *
 * A PR can have multiple `reviews` rows (one per agent run); taking only the
 * latest hides open findings from earlier runs (`server/INSIGHTS.md`
 * 2026-06-30; `reviews/run-executor.ts:218`). This tool aggregates OPEN
 * findings (`dismissed_at === null`) across ALL `kind:'review'` rows, and
 * separately reports `verdict`/`score` from the latest review
 * (`reviewsForPull` returns newest-first — `reviews/service.ts:171`).
 */
import { z } from 'zod';
import { apiClient } from '../api-client.js';
import { resolvePr, resolveRepo } from '../resolve.js';
import type { FindingLite } from '../types.js';
import { errorResult, textResult } from './tool.js';
import type { ToolDef } from './tool.js';

const InputSchema = {
  repo: z.string().min(1).describe("Repo in 'owner/name' form"),
  pr: z.number().int().describe('Pull request number'),
};

/** Raw shape read off `GET /pulls/:id/reviews` (`ReviewDto` /
 * `ReviewDtoFinding` — `server/src/modules/reviews/helpers.ts`). Only the
 * fields this tool actually reads. */
interface ReviewRowRaw {
  kind: 'summary' | 'review';
  verdict: string | null;
  score: number | null;
  findings: FindingRawRaw[];
}

interface FindingRawRaw {
  severity: string;
  title: string;
  file: string;
  start_line: number;
  end_line: number;
  category: string;
  confidence: number;
  dismissed_at: string | null;
}

function toFindingLite(f: FindingRawRaw): FindingLite {
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

export const getFindingsTool: ToolDef<typeof InputSchema> = {
  name: 'dev_digest_get_findings',
  description:
    "Get findings from already-completed reviews of a pull request, as a concise list " +
    '(severity, title, file, line range, category). Read-only; does not start a review.',
  inputSchema: InputSchema,
  annotations: { title: 'Get findings', readOnlyHint: true },
  handler: async ({ repo, pr }) => {
    const repoResolved = await resolveRepo(repo);
    if (!repoResolved.ok) return errorResult(repoResolved.error);

    const prResolved = await resolvePr(repoResolved.id, pr);
    if (!prResolved.ok) return errorResult(prResolved.error);

    const res = await apiClient.get<ReviewRowRaw[]>(`/pulls/${prResolved.id}/reviews`);
    if (!res.ok) return errorResult(res.error);

    const reviewRows = res.data.filter((r) => r.kind === 'review');
    if (reviewRows.length === 0) {
      return textResult({
        verdict: null,
        score: null,
        findings: [],
        hint: `No reviews yet for ${repo}#${pr} — call dev_digest_run_review to start one.`,
      });
    }

    const findings: FindingLite[] = reviewRows
      .flatMap((r) => r.findings)
      .filter((f) => f.dismissed_at === null)
      .map(toFindingLite);

    const latest = reviewRows[0]!;
    return textResult({ verdict: latest.verdict, score: latest.score, findings });
  },
};
