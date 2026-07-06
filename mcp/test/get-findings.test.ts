/**
 * `get_findings` — aggregation across MULTIPLE `kind:'review'` rows (open
 * findings from an OLDER review must not be hidden by a clean latest
 * review), dismissed findings excluded, `kind:'summary'` rows excluded
 * entirely. See `server/INSIGHTS.md` 2026-06-30 / plan Risks.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getFindingsTool } from '../src/tools/get-findings.js';
import { PULLS_FIXTURE, REPOS_FIXTURE, REVIEWS_FIXTURE } from './fixtures.js';
import { get, mockFetch } from './mock-fetch.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

function parse(result: Awaited<ReturnType<typeof getFindingsTool.handler>>): any {
  return JSON.parse(result.content[0]!.text);
}

describe('get_findings', () => {
  it('aggregates open findings across all review rows, excludes dismissed and summary rows', async () => {
    mockFetch([
      get('/repos', REPOS_FIXTURE),
      get('/repos/repo-1/pulls', PULLS_FIXTURE),
      get('/pulls/pr-42/reviews', REVIEWS_FIXTURE),
    ]);

    const result = await getFindingsTool.handler({ repo: 'acme/widgets', pr: 42 });
    expect(result.isError).toBeUndefined();

    const body = parse(result);
    // verdict/score come from the LATEST review row (reviews[0]).
    expect(body.verdict).toBe('approve');
    expect(body.score).toBe(92);

    // 3 open findings total: 1 from the latest review + 1 open from the
    // older review (the dismissed one and the summary-row one excluded).
    const titles = body.findings.map((f: any) => f.title).sort();
    expect(titles).toEqual(['N+1 query in widget loader', 'Prefer const over let']);
    expect(body.findings).toHaveLength(2);

    // Dismissed and summary-only findings must never appear.
    expect(titles).not.toContain('Unused variable');
    expect(titles).not.toContain('Should never surface — kind is summary, not review');

    // Compact projection only — no rationale/suggestion leakage.
    for (const finding of body.findings) {
      expect(finding).not.toHaveProperty('rationale');
      expect(finding).not.toHaveProperty('suggestion');
      expect(finding).not.toHaveProperty('dismissed_at');
    }
  });

  it('returns an empty result with a run_review hint when there are no reviews yet', async () => {
    mockFetch([
      get('/repos', REPOS_FIXTURE),
      get('/repos/repo-1/pulls', PULLS_FIXTURE),
      get('/pulls/pr-42/reviews', []),
    ]);

    const result = await getFindingsTool.handler({ repo: 'acme/widgets', pr: 42 });
    expect(result.isError).toBeUndefined();
    const body = parse(result);
    expect(body.verdict).toBeNull();
    expect(body.findings).toEqual([]);
    expect(body.hint).toContain('run_review');
  });

  it('error-forwards when the PR cannot be resolved', async () => {
    mockFetch([get('/repos', REPOS_FIXTURE), get('/repos/repo-1/pulls', PULLS_FIXTURE)]);

    const result = await getFindingsTool.handler({ repo: 'acme/widgets', pr: 999 });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('PR #999 not found');
  });
});
