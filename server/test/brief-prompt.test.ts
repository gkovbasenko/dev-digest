import { describe, it, expect } from 'vitest';
import type { LLMProvider, PrBlastResponse, SmartDiff, StructuredRequest, StructuredResult } from '@devdigest/shared';
import { buildBriefPrompt, computeBrief, type BriefFileInput, type BriefPrInput } from '../src/modules/reviews/brief/compute.js';
import { groundBrief } from '../src/modules/reviews/brief/ground.js';
import type { Container } from '../src/platform/container.js';

/**
 * Brief prompt-assembly + grounding unit coverage — no DB/network. Mirrors
 * `reviews-intent.test.ts`'s style (fake LLM + fake container).
 */

const REPO = { owner: 'acme', name: 'payments-api' };

const MIN_BLAST: PrBlastResponse = {
  changed_symbols: [{ name: 'chargeCard', file: 'src/billing.ts', kind: 'function' }],
  downstream: [
    {
      symbol: 'chargeCard',
      callers: [{ name: 'handleCheckout', file: 'src/checkout.ts', line: 12 }],
      endpoints_affected: ['POST /checkout'],
      crons_affected: [],
    },
  ],
  summary: '',
  impacted_endpoints: ['POST /checkout'],
  impacted_crons: [],
  index_status: 'full',
  degraded: false,
  reason: null,
};

const DEGRADED_BLAST: PrBlastResponse = {
  ...MIN_BLAST,
  index_status: 'degraded',
  degraded: true,
  reason: 'This repo is only partially indexed.',
};

const SMART_DIFF: SmartDiff = {
  groups: [
    {
      role: 'core',
      files: [
        { path: 'src/billing.ts', pseudocode_summary: null, additions: 20, deletions: 5, findings: [] },
        { path: 'src/checkout.ts', pseudocode_summary: null, additions: 3, deletions: 1, findings: [] },
      ],
    },
    {
      role: 'boilerplate',
      files: [{ path: 'src/generated.ts', pseudocode_summary: null, additions: 100, deletions: 0, findings: [] }],
    },
  ],
  split_suggestion: { too_big: false, total_lines: 129, proposed_splits: [] },
};

const FILES: BriefFileInput[] = [
  {
    path: 'src/billing.ts',
    patch: '@@ -10,3 +10,4 @@\n   charge(amount);\n+  SECRET_PATCH_BODY_TOKEN_18271\n   done();',
  },
  { path: 'src/checkout.ts', patch: '@@ -1,1 +1,2 @@\n+x' },
];

const PULL: BriefPrInput = {
  id: 'pr-1',
  number: 482,
  title: 'Add rate limiting to public API endpoints',
  body: 'Adds a middleware. Closes #471.',
};

describe('buildBriefPrompt', () => {
  it('AC-6: includes changed-file paths + Smart-Diff group stats, but never a diff-body token', async () => {
    const messages = await buildBriefPrompt({
      pull: PULL,
      intent: null,
      linkedIssue: undefined,
      blast: MIN_BLAST,
      smartDiff: SMART_DIFF,
      files: FILES,
      specs: [],
    });
    const user = messages.find((m) => m.role === 'user')!.content;

    expect(user).toContain('src/billing.ts');
    expect(user).toContain('src/checkout.ts');
    expect(user).toContain('core: 2 file(s), +23/-6');
    expect(user).toContain('boilerplate: 1 file(s), +100/-0');
    expect(user).toContain('@@ -10,3 +10,4 @@');

    // A token that ONLY exists in a patch BODY line must never leak into the prompt.
    expect(user).not.toContain('SECRET_PATCH_BODY_TOKEN_18271');
  });

  it('AC-8: wraps every foreign segment in <untrusted> and the system prompt carries the SECURITY clause', async () => {
    const messages = await buildBriefPrompt({
      pull: PULL,
      intent: null,
      linkedIssue: { number: 471, title: 'Public endpoints are unprotected', body: 'Repro steps…', state: 'open' },
      blast: MIN_BLAST,
      smartDiff: SMART_DIFF,
      files: FILES,
      specs: [{ path: 'specs/api.md', content: 'API conventions.' }],
    });
    const system = messages.find((m) => m.role === 'system')!.content;
    const user = messages.find((m) => m.role === 'user')!.content;

    expect(system).toContain('SECURITY');
    expect(user).toContain('<untrusted source="pr-description">');
    expect(user).toContain('<untrusted source="linked-issue">');
    expect(user).toContain('<untrusted source="spec:specs/api.md">');
    expect(user).toContain('API conventions.');
  });

  it('degraded blast adds a lower-confidence note', async () => {
    const messages = await buildBriefPrompt({
      pull: PULL,
      intent: null,
      linkedIssue: undefined,
      blast: DEGRADED_BLAST,
      smartDiff: SMART_DIFF,
      files: FILES,
      specs: [],
    });
    const user = messages.find((m) => m.role === 'user')!.content;
    expect(user).toMatch(/LOWER-CONFIDENCE/);
  });

  it('renders the no-description / no-linked-issue fallbacks and a derived-intent block', async () => {
    const messages = await buildBriefPrompt({
      pull: { ...PULL, body: null },
      intent: { intent: 'Adds rate limiting.', in_scope: ['Limiter middleware'], out_of_scope: ['Auth'] },
      linkedIssue: undefined,
      blast: MIN_BLAST,
      smartDiff: SMART_DIFF,
      files: FILES,
      specs: [],
    });
    const user = messages.find((m) => m.role === 'user')!.content;
    expect(user).toContain('(No PR description provided.)');
    expect(user).toContain('(No linked issue found.)');
    expect(user).toContain('Summary: Adds rate limiting.');
    expect(user).toContain('In scope: Limiter middleware');
  });
});

// ---- computeBrief ---------------------------------------------------------

const FIXTURE_BRIEF = {
  what: 'Adds rate limiting to public endpoints.',
  why: 'Prevents abuse of unauthenticated routes.',
  risk_level: 'medium',
  risks: [
    {
      kind: 'correctness',
      title: 'Limiter bypass',
      explanation: 'The limiter may not cover all routes.',
      severity: 'medium',
      file_refs: ['src/billing.ts'],
    },
  ],
  review_focus: [{ file: 'src/billing.ts', note: 'Check the limiter config.' }],
};

function fakeLlm(): LLMProvider & { calls: StructuredRequest<unknown>[] } {
  const calls: StructuredRequest<unknown>[] = [];
  return {
    id: 'openai',
    calls,
    async listModels() {
      return [];
    },
    async complete() {
      throw new Error('not used');
    },
    async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
      calls.push(req as StructuredRequest<unknown>);
      return {
        data: FIXTURE_BRIEF as T,
        model: req.model,
        tokensIn: 80,
        tokensOut: 40,
        costUsd: null,
        raw: JSON.stringify(FIXTURE_BRIEF),
        attempts: 1,
      };
    },
    async embed() {
      return [];
    },
  };
}

/** Fake container: no clone configured (db select chain resolves to []), so
 *  `gatherSpecs` degrades to [] without needing a real ContextRepository/DB. */
function fakeContainer(opts: {
  llm: LLMProvider;
  getIssue?: (n: number) => Promise<{ number: number; title: string; body: string; state: string }>;
}): Container {
  return {
    db: {
      select: () => ({ from: () => ({ where: async () => [] }) }),
    },
    llm: async () => opts.llm,
    github: async () => ({
      getIssue: async (_repo: unknown, n: number) => {
        if (!opts.getIssue) throw new Error('no linked issue in this fixture');
        return opts.getIssue(n);
      },
    }),
  } as unknown as Container;
}

describe('computeBrief', () => {
  it('makes exactly one completeStructured call and reports input presence', async () => {
    const llm = fakeLlm();

    const result = await computeBrief({
      container: fakeContainer({
        llm,
        getIssue: async (n) => ({ number: n, title: 'Unprotected endpoints', body: 'Repro', state: 'open' }),
      }),
      workspaceId: 'ws-1',
      repoId: 'repo-1',
      pull: PULL,
      repo: REPO,
      files: FILES,
      intent: null,
      blast: MIN_BLAST,
      smartDiff: SMART_DIFF,
    });

    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0]!.schemaName).toBe('RiskBrief');
    expect(result.brief).toEqual(FIXTURE_BRIEF);
    expect(result.provider).toBe('openai');
    expect(result.model).toBe('gpt-4.1');
    expect(result.inputPresence).toEqual({ intent: false, issue: true, specs: 0 });
  });

  it('reports intent presence when an already-computed intent is passed in (no intent-model call)', async () => {
    const llm = fakeLlm();

    const result = await computeBrief({
      container: fakeContainer({ llm }),
      workspaceId: 'ws-1',
      repoId: 'repo-1',
      pull: { ...PULL, body: null },
      repo: REPO,
      files: FILES,
      intent: { intent: 'Adds rate limiting.', in_scope: [], out_of_scope: [] },
      blast: MIN_BLAST,
      smartDiff: SMART_DIFF,
    });

    expect(llm.calls).toHaveLength(1);
    expect(result.inputPresence).toEqual({ intent: true, issue: false, specs: 0 });
  });

  it('degrades to no linked issue when the GitHub lookup throws (never throws itself)', async () => {
    const llm = fakeLlm();

    const result = await computeBrief({
      container: fakeContainer({
        llm,
        getIssue: async () => {
          throw new Error('GitHub 404');
        },
      }),
      workspaceId: 'ws-1',
      repoId: 'repo-1',
      pull: PULL,
      repo: REPO,
      files: FILES,
      intent: null,
      blast: MIN_BLAST,
      smartDiff: SMART_DIFF,
    });

    expect(result.inputPresence.issue).toBe(false);
  });
});

// ---- groundBrief ------------------------------------------------------------

describe('groundBrief', () => {
  it('drops file refs not present in validPaths, keeps real ones, and counts drops (AC-7)', () => {
    const brief = {
      ...FIXTURE_BRIEF,
      risks: [
        { ...FIXTURE_BRIEF.risks[0]!, file_refs: ['src/billing.ts', 'src/ghost-does-not-exist.ts'] },
      ],
      review_focus: [
        { file: 'src/billing.ts', note: 'real' },
        { file: 'src/ghost-does-not-exist.ts', note: 'ghost' },
      ],
    } as typeof FIXTURE_BRIEF;

    const validPaths = new Set(['src/billing.ts']);
    const { brief: grounded, droppedCount } = groundBrief(brief, validPaths);

    expect(grounded.risks[0]!.file_refs).toEqual(['src/billing.ts']);
    expect(grounded.review_focus).toEqual([{ file: 'src/billing.ts', note: 'real' }]);
    expect(droppedCount).toBe(2);
  });

  it('leaves an already-fully-grounded brief unchanged with droppedCount 0', () => {
    const validPaths = new Set(['src/billing.ts']);
    const { brief: grounded, droppedCount } = groundBrief(FIXTURE_BRIEF as typeof FIXTURE_BRIEF, validPaths);
    expect(grounded).toEqual(FIXTURE_BRIEF);
    expect(droppedCount).toBe(0);
  });
});
