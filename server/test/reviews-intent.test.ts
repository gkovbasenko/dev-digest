import { describe, it, expect } from 'vitest';
import type { LLMProvider, StructuredRequest, StructuredResult } from '@devdigest/shared';
import { extractHunkHeaders, hunkHeadersForFiles } from '../src/modules/reviews/intent/hunk-headers.js';
import { computeIntent, renderIntent, type IntentPrInput } from '../src/modules/reviews/intent/compute.js';
import type { Container } from '../src/platform/container.js';

/**
 * C1/C2 unit coverage — hunk-header extraction (pure) and intent computation
 * (LLM call mocked, no DB/network). Covers the "no documentation" fallback
 * (no PR body + no linked issue) required by the plan.
 */

describe('extractHunkHeaders', () => {
  it('returns only the @@ … @@ header lines from a multi-hunk patch, dropping bodies', () => {
    const patch =
      '@@ -10,3 +10,4 @@\n' +
      '   port: 3000,\n' +
      '+  stripeKey: "sk_live_xxx",\n' +
      '   redisUrl: x,\n' +
      '@@ -40,2 +41,3 @@\n' +
      '   foo,\n' +
      '+  bar,\n';
    expect(extractHunkHeaders(patch)).toEqual(['@@ -10,3 +10,4 @@', '@@ -40,2 +41,3 @@']);
  });

  it('returns [] for a null, undefined, or empty patch', () => {
    expect(extractHunkHeaders(null)).toEqual([]);
    expect(extractHunkHeaders(undefined)).toEqual([]);
    expect(extractHunkHeaders('')).toEqual([]);
  });

  it('does not mistake a diff-body line starting with @@ for a header (e.g. Ruby class vars)', () => {
    // The context line is space-prefixed; after trim it starts with "@@" but is
    // NOT a valid hunk header and must not leak into the headers-only output.
    const patch = '@@ -1,3 +1,4 @@\n class C\n   @@count = 0\n+  @@total = 1';
    expect(extractHunkHeaders(patch)).toEqual(['@@ -1,3 +1,4 @@']);
  });

  it('matches a header without line counts (@@ -a +c @@)', () => {
    expect(extractHunkHeaders('@@ -1 +1 @@\n context')).toEqual(['@@ -1 +1 @@']);
  });
});

describe('hunkHeadersForFiles', () => {
  it('maps each file to its own header list', () => {
    const result = hunkHeadersForFiles([
      { path: 'a.ts', patch: '@@ -1,1 +1,2 @@\n+x\n' },
      { path: 'b.ts', patch: null },
    ]);
    expect(result).toEqual([
      { path: 'a.ts', headers: ['@@ -1,1 +1,2 @@'] },
      { path: 'b.ts', headers: [] },
    ]);
  });
});

describe('renderIntent', () => {
  it('renders the suggested Summary / In scope / Out of scope block', () => {
    const rendered = renderIntent({
      intent: 'Adds rate limiting to public endpoints.',
      in_scope: ['Rate limiter middleware', 'Config for limits'],
      out_of_scope: ['Auth changes'],
    });
    expect(rendered).toBe(
      'Summary: Adds rate limiting to public endpoints.\n' +
        'In scope:\n' +
        '- Rate limiter middleware\n' +
        '- Config for limits\n' +
        'Out of scope:\n' +
        '- Auth changes',
    );
  });

  it('omits empty in-scope/out-of-scope sections', () => {
    expect(renderIntent({ intent: 'Fix a typo.', in_scope: [], out_of_scope: [] })).toBe(
      'Summary: Fix a typo.',
    );
  });
});

// ---- computeIntent -------------------------------------------------------

const FIXTURE_INTENT = {
  intent: 'Adds rate limiting to public API endpoints.',
  in_scope: ['Rate limiter middleware'],
  out_of_scope: ['Auth changes'],
};

/** Minimal LLMProvider fake — full control over tokensIn + call capture. */
function fakeLlm(tokensIn = 42): LLMProvider & { calls: StructuredRequest<unknown>[] } {
  const calls: StructuredRequest<unknown>[] = [];
  return {
    id: 'openrouter',
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
        data: FIXTURE_INTENT as T,
        model: req.model,
        tokensIn,
        tokensOut: 20,
        costUsd: null,
        raw: JSON.stringify(FIXTURE_INTENT),
        attempts: 1,
      };
    },
    async embed() {
      return [];
    },
  };
}

/** Fake container exposing only what computeIntent (+ resolveFeatureModel) touch. */
function fakeContainer(opts: {
  llm: LLMProvider;
  getIssue?: (n: number) => Promise<{ number: number; title: string; body: string; state: string }>;
}): Container {
  return {
    // resolveFeatureModel → getFeatureModelOverride reads container.db; no override
    // stored → falls back to the FEATURE_MODELS registry default (openrouter/flash).
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

const REPO = { owner: 'acme', name: 'payments-api' };

describe('computeIntent', () => {
  it('computes intent with no PR body and no linked issue (no-documentation fallback)', async () => {
    const llm = fakeLlm(55);
    const pull: IntentPrInput = { id: 'pr-1', number: 482, title: 'Add rate limiting', body: null };
    const files = [{ path: 'src/config.ts', patch: '@@ -10,3 +10,4 @@\n+  stripeKey: x,\n' }];
    const logged: unknown[] = [];

    const result = await computeIntent({
      container: fakeContainer({ llm }),
      workspaceId: 'ws-1',
      pull,
      repo: REPO,
      files,
      logger: { info: (obj) => logged.push(obj) },
    });

    expect(result).toEqual(FIXTURE_INTENT);
    expect(llm.calls).toHaveLength(1);
    const userMessage = (llm.calls[0]!.messages.find((m) => m.role === 'user')?.content ?? '') as string;
    // No-documentation fallback instruction must be present when body + linked issue are absent.
    expect(userMessage).toMatch(/No PR description or linked issue is available/i);
    expect(userMessage).toContain('(No PR description provided.)');
    expect(userMessage).toContain('(No linked issue found.)');
    expect(userMessage).toContain('@@ -10,3 +10,4 @@');
    // Diff body lines must NOT leak into the intent-only prompt.
    expect(userMessage).not.toContain('stripeKey');

    // Token-savings log line — including the estimated full-diff alternative
    // and the derived savings, not just tokensIn.
    expect(logged).toHaveLength(1);
    const patchLen = files[0]!.patch!.length;
    const expectedEst = Math.round(patchLen / 4);
    expect(logged[0]).toMatchObject({
      prId: 'pr-1',
      tokensIn: 55,
      estFullDiffTokens: expectedEst,
      savedApprox: Math.max(0, expectedEst - 55),
    });
  });

  it('ignores a bare #123 with no closing keyword — no phantom linked-issue fetch', async () => {
    // A URL and a bare mention, neither preceded by close/fix/resolve — the
    // stricter regex must NOT resolve a phantom issue (no getIssue call).
    const llm = fakeLlm();
    const issueCalls: number[] = [];
    const pull: IntentPrInput = {
      id: 'pr-5',
      number: 14,
      title: 'Docs tweak',
      body: 'See https://github.com/acme/x/issues/123 and #999 for background.',
    };
    const files = [{ path: 'README.md', patch: '@@ -1,1 +1,2 @@\n+x\n' }];

    const result = await computeIntent({
      container: fakeContainer({
        llm,
        getIssue: async (n) => {
          issueCalls.push(n);
          return { number: n, title: 't', body: '', state: 'open' };
        },
      }),
      workspaceId: 'ws-1',
      pull,
      repo: REPO,
      files,
    });

    expect(result).toEqual(FIXTURE_INTENT);
    expect(issueCalls).toEqual([]);
    const userMessage = (llm.calls[0]!.messages.find((m) => m.role === 'user')?.content ?? '') as string;
    expect(userMessage).toContain('(No linked issue found.)');
  });

  it('falls back to "(No linked issue found.)" when the linked-issue fetch throws', async () => {
    const llm = fakeLlm();
    const pull: IntentPrInput = {
      id: 'pr-3',
      number: 12,
      title: 'Fix retries',
      body: 'Closes #471.',
    };
    const files = [{ path: 'src/x.ts', patch: '@@ -1,1 +1,2 @@\n+x\n' }];

    const result = await computeIntent({
      container: fakeContainer({
        llm,
        getIssue: async () => {
          throw new Error('GitHub 404');
        },
      }),
      workspaceId: 'ws-1',
      pull,
      repo: REPO,
      files,
    });

    expect(result).toEqual(FIXTURE_INTENT);
    const userMessage = (llm.calls[0]!.messages.find((m) => m.role === 'user')?.content ?? '') as string;
    expect(userMessage).toContain('(No linked issue found.)');
    // Body IS present, so the no-documentation fallback must NOT appear.
    expect(userMessage).not.toMatch(/No PR description or linked issue is available/i);
  });

  it('shows "(No linked issue found.)" without the no-doc fallback when the body has no issue reference', async () => {
    const llm = fakeLlm();
    const pull: IntentPrInput = {
      id: 'pr-4',
      number: 13,
      title: 'Tidy retry logic',
      body: 'Fix a bug in the retry backoff — no ticket.',
    };
    const files = [{ path: 'src/x.ts', patch: '@@ -1,1 +1,2 @@\n+x\n' }];

    await computeIntent({
      container: fakeContainer({ llm }),
      workspaceId: 'ws-1',
      pull,
      repo: REPO,
      files,
    });

    const userMessage = (llm.calls[0]!.messages.find((m) => m.role === 'user')?.content ?? '') as string;
    expect(userMessage).toContain('## PR description');
    expect(userMessage).toContain('(No linked issue found.)');
    expect(userMessage).not.toMatch(/No PR description or linked issue is available/i);
  });

  it('resolves and includes a linked issue referenced in the PR body', async () => {
    const llm = fakeLlm();
    const pull: IntentPrInput = {
      id: 'pr-2',
      number: 10,
      title: 'Fix payment retries',
      body: 'Closes #471. See the linked issue for repro steps.',
    };
    const files = [{ path: 'src/retry.ts', patch: '@@ -1,1 +1,2 @@\n+x\n' }];

    const result = await computeIntent({
      container: fakeContainer({
        llm,
        getIssue: async (n) => ({
          number: n,
          title: 'Payments retry loop never terminates',
          body: 'Steps to repro…',
          state: 'open',
        }),
      }),
      workspaceId: 'ws-1',
      pull,
      repo: REPO,
      files,
    });

    expect(result).toEqual(FIXTURE_INTENT);
    const userMessage = (llm.calls[0]!.messages.find((m) => m.role === 'user')?.content ?? '') as string;
    expect(userMessage).toContain('#471');
    expect(userMessage).toContain('Payments retry loop never terminates');
    expect(userMessage).not.toMatch(/No linked issue is available/i);
  });
});
