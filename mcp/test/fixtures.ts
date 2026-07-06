/**
 * Contract-aligned fixtures — the shapes below mirror the REAL server
 * response shapes, not the `*Lite` projections MCP reads. This is the
 * contract-guard the plan's Risks section calls for: `*Lite`/`get_findings`
 * aggregation drift wouldn't be caught by `tsc` (types.ts is hand-maintained,
 * not imported from `@devdigest/shared`), so tests are grounded against the
 * actual Zod contracts / route handlers instead of inventing shapes.
 *
 * Sources:
 *  - Agent            ← server/src/vendor/shared/contracts/knowledge.ts (Agent)
 *  - Repo              ← server/src/vendor/shared/contracts/platform.ts (Repo)
 *  - PrMeta            ← server/src/vendor/shared/contracts/platform.ts (PrMeta)
 *  - RunSummary        ← server/src/vendor/shared/contracts/trace.ts (RunSummary)
 *  - ReviewDto/Finding ← server/src/modules/reviews/helpers.ts (ReviewDto, ReviewDtoFinding)
 *  - ConventionCandidate ← server/src/vendor/shared/contracts/knowledge.ts (ConventionCandidate)
 *  - POST /pulls/:id/review response ← server/src/modules/reviews/routes.ts:30-42
 *    (`{ pr_id, runs, reviews: [] }`, fire-and-forget — reviews.ts:141-145)
 */

/** `GET /agents` — full `Agent` shape (knowledge.ts). Includes a name
 * collision ('shared-name', one enabled/one disabled) and a name collision
 * where BOTH remain enabled ('ambiguous-name') to exercise `resolveAgent`. */
export const AGENTS_FIXTURE = [
  {
    id: 'agent-1',
    name: 'security-reviewer',
    description: 'Flags security issues',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    system_prompt: 'You are a security reviewer.',
    output_schema: null,
    enabled: true,
    version: 1,
    strategy: 'single-pass',
    ci_fail_on: 'critical',
    repo_intel: true,
  },
  {
    id: 'agent-2',
    name: 'perf-reviewer',
    description: 'Flags performance issues',
    provider: 'openai',
    model: 'gpt-4.1',
    system_prompt: 'You are a performance reviewer.',
    output_schema: null,
    enabled: true,
    version: 1,
    strategy: 'single-pass',
    ci_fail_on: 'warning',
    repo_intel: false,
  },
  // 'shared-name': two agents, only one enabled -> enabled-narrowing resolves it.
  {
    id: 'agent-3',
    name: 'shared-name',
    description: 'The enabled one',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    system_prompt: 'p',
    output_schema: null,
    enabled: true,
    version: 1,
    strategy: 'single-pass',
    ci_fail_on: 'critical',
    repo_intel: true,
  },
  {
    id: 'agent-4',
    name: 'shared-name',
    description: 'The disabled one',
    provider: 'openai',
    model: 'gpt-4.1',
    system_prompt: 'p',
    output_schema: null,
    enabled: false,
    version: 1,
    strategy: 'single-pass',
    ci_fail_on: 'critical',
    repo_intel: true,
  },
  // 'ambiguous-name': two agents, BOTH enabled -> still ambiguous after narrowing.
  {
    id: 'agent-5',
    name: 'ambiguous-name',
    description: 'First ambiguous',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    system_prompt: 'p',
    output_schema: null,
    enabled: true,
    version: 1,
    strategy: 'single-pass',
    ci_fail_on: 'critical',
    repo_intel: true,
  },
  {
    id: 'agent-6',
    name: 'ambiguous-name',
    description: 'Second ambiguous',
    provider: 'openai',
    model: 'gpt-4.1',
    system_prompt: 'p',
    output_schema: null,
    enabled: true,
    version: 1,
    strategy: 'single-pass',
    ci_fail_on: 'critical',
    repo_intel: true,
  },
];

/** `GET /repos` — full `Repo` shape (platform.ts). */
export const REPOS_FIXTURE = [
  {
    id: 'repo-1',
    workspace_id: 'workspace-1',
    owner: 'acme',
    name: 'widgets',
    full_name: 'acme/widgets',
    default_branch: 'main',
    clone_path: '/tmp/acme-widgets',
    last_polled_at: '2026-01-01T00:00:00Z',
    created_by: 'user-1',
  },
  {
    id: 'repo-2',
    workspace_id: 'workspace-1',
    owner: 'acme',
    name: 'other',
    full_name: 'acme/other',
    default_branch: 'main',
    clone_path: null,
    last_polled_at: null,
    created_by: null,
  },
];

/** `GET /repos/:id/pulls` — full `PrMeta` shape (platform.ts). PR #43 has a
 * nullish `id` — returned by GitHub but not yet imported/persisted. */
export const PULLS_FIXTURE = [
  {
    id: 'pr-42',
    number: 42,
    title: 'Add widget factory',
    author: 'octocat',
    branch: 'feature/widget-factory',
    base: 'main',
    head_sha: 'abc123',
    additions: 120,
    deletions: 4,
    files_count: 3,
    status: 'open',
    opened_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
  },
  {
    id: null,
    number: 43,
    title: 'Not imported yet',
    author: 'octocat',
    branch: 'feature/not-imported',
    base: 'main',
    head_sha: 'def456',
    additions: 5,
    deletions: 1,
    files_count: 1,
    status: 'open',
    opened_at: '2026-01-03T00:00:00Z',
    updated_at: '2026-01-03T00:00:00Z',
  },
];

/** `GET /pulls/:id/reviews` for PR #42 (`pr-42`) — multiple `ReviewDto` rows,
 * newest-first (`reviewsForPull`, server/INSIGHTS.md 2026-06-30): the LATEST
 * review is a clean approve, but an OLDER review has open findings that a
 * "latest-only" read would hide. Includes a dismissed finding (must be
 * excluded) and a `kind: 'summary'` row (must be excluded entirely). */
export const REVIEWS_FIXTURE = [
  {
    id: 'review-latest',
    pr_id: 'pr-42',
    agent_id: 'agent-1',
    run_id: 'run-latest',
    agent_name: 'security-reviewer',
    kind: 'review',
    verdict: 'approve',
    summary: 'Looks good now.',
    score: 92,
    model: 'claude-sonnet-4-5',
    created_at: '2026-01-05T00:00:00Z',
    findings: [
      {
        id: 'f-latest-1',
        severity: 'SUGGESTION',
        category: 'style',
        title: 'Prefer const over let',
        file: 'src/widget.ts',
        start_line: 10,
        end_line: 10,
        rationale: 'const communicates intent better here.',
        suggestion: 'use const',
        confidence: 0.6,
        kind: 'finding',
        review_id: 'review-latest',
        accepted_at: null,
        dismissed_at: null,
      },
    ],
  },
  {
    id: 'review-older',
    pr_id: 'pr-42',
    agent_id: 'agent-2',
    run_id: 'run-older',
    agent_name: 'perf-reviewer',
    kind: 'review',
    verdict: 'request_changes',
    summary: 'N+1 query in the loop.',
    score: 40,
    model: 'gpt-4.1',
    created_at: '2026-01-04T00:00:00Z',
    findings: [
      {
        id: 'f-older-1',
        severity: 'CRITICAL',
        category: 'perf',
        title: 'N+1 query in widget loader',
        file: 'src/widget-loader.ts',
        start_line: 22,
        end_line: 30,
        rationale: 'Each iteration issues a separate DB round trip.',
        suggestion: null,
        confidence: 0.9,
        kind: 'finding',
        review_id: 'review-older',
        accepted_at: null,
        dismissed_at: null, // OPEN — must survive aggregation despite not being "latest"
      },
      {
        id: 'f-older-2',
        severity: 'WARNING',
        category: 'bug',
        title: 'Unused variable',
        file: 'src/widget-loader.ts',
        start_line: 5,
        end_line: 5,
        rationale: 'Dead code.',
        suggestion: null,
        confidence: 0.5,
        kind: 'finding',
        review_id: 'review-older',
        accepted_at: null,
        dismissed_at: '2026-01-04T12:00:00Z', // DISMISSED — must be excluded
      },
    ],
  },
  {
    id: 'summary-row',
    pr_id: 'pr-42',
    agent_id: null,
    run_id: null,
    agent_name: null,
    kind: 'summary',
    verdict: null,
    summary: 'PR-level rollup, not a review run.',
    score: null,
    model: null,
    created_at: '2026-01-05T00:01:00Z',
    findings: [
      {
        id: 'f-summary-1',
        severity: 'CRITICAL',
        category: 'bug',
        title: 'Should never surface — kind is summary, not review',
        file: 'src/widget.ts',
        start_line: 1,
        end_line: 1,
        rationale: 'x',
        suggestion: null,
        confidence: 0.9,
        kind: 'finding',
        review_id: 'summary-row',
        accepted_at: null,
        dismissed_at: null,
      },
    ],
  },
];

/** `GET /repos/:id/conventions` — full `ConventionCandidate` shape
 * (knowledge.ts). */
export const CONVENTIONS_FIXTURE = [
  {
    id: 'conv-1',
    rule: 'Use named exports, not default exports',
    category: 'imports',
    evidence_path: 'src/index.ts',
    evidence_snippet: 'export function foo() {}',
    confidence: 0.85,
    accepted: true,
    rejected: false,
  },
  {
    id: 'conv-2',
    rule: 'Prefer async/await over .then chains',
    category: 'other',
    evidence_path: null,
    evidence_snippet: null,
    confidence: null,
    accepted: false,
    rejected: false,
  },
];

/** `POST /pulls/:id/review` response — fire-and-forget, always
 * `reviews: []` (`reviews/service.ts:141-145`). */
export function triggerReviewResponse(runId: string, agentId: string, agentName: string) {
  return {
    pr_id: 'pr-42',
    runs: [{ run_id: runId, agent_id: agentId, agent_name: agentName }],
    reviews: [] as unknown[],
  };
}

/** `GET /pulls/:id/runs` — full `RunSummary` shape (trace.ts) for one run. */
export function runSummary(overrides: Partial<{
  run_id: string;
  status: string | null;
  error: string | null;
}>) {
  return {
    run_id: overrides.run_id ?? 'run-x',
    agent_id: 'agent-1',
    agent_name: 'security-reviewer',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    status: overrides.status ?? 'running',
    error: overrides.error ?? null,
    duration_ms: null,
    tokens_in: null,
    tokens_out: null,
    findings_count: null,
    grounding: null,
    ran_at: '2026-01-06T00:00:00Z',
  };
}

/** A single-review-row `GET /pulls/:id/reviews` response for a specific
 * `run_id`, used by `run_review`'s own-run-id-match read-back. */
export function reviewForRun(
  runId: string,
  overrides: Partial<{ verdict: string | null; score: number | null }> = {},
) {
  return [
    {
      id: 'review-x',
      pr_id: 'pr-42',
      agent_id: 'agent-1',
      run_id: runId,
      agent_name: 'security-reviewer',
      kind: 'review' as const,
      verdict: overrides.verdict ?? 'comment',
      summary: 'ok',
      score: overrides.score ?? 77,
      model: 'claude-sonnet-4-5',
      created_at: '2026-01-06T00:00:00Z',
      findings: [
        {
          id: 'f-x-1',
          severity: 'WARNING',
          category: 'bug',
          title: 'Off-by-one in pagination',
          file: 'src/pagination.ts',
          start_line: 8,
          end_line: 12,
          rationale: 'Loop bound excludes the last page.',
          suggestion: 'Use <= instead of <',
          confidence: 0.7,
          kind: 'finding',
          review_id: 'review-x',
          accepted_at: null,
          dismissed_at: null,
        },
      ],
    },
  ];
}
