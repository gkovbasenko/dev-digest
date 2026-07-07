/**
 * `get_blast_radius` — live tool over `GET /pulls/:id/blast`. Covers repo+pr
 * resolution, the degraded/partial-index passthrough, and the response-size
 * cap on `downstream[]`/per-symbol `callers[]`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getBlastRadiusTool } from '../src/tools/get-blast-radius.js';
import { PULLS_FIXTURE, REPOS_FIXTURE } from './fixtures.js';
import { get, mockFetch } from './mock-fetch.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

function parse(result: Awaited<ReturnType<typeof getBlastRadiusTool.handler>>): any {
  return JSON.parse(result.content[0]!.text);
}

/** Minimal `PrBlastResponse`-shaped fixture (contracts/brief.ts). */
const BASE_BLAST_RESPONSE = {
  changed_symbols: [{ name: 'createWidget', file: 'src/widget.ts', kind: 'function' }],
  downstream: [
    {
      symbol: 'createWidget',
      callers: [{ name: 'handleCreate', file: 'src/routes.ts', line: 12 }],
      endpoints_affected: ['POST /widgets'],
      crons_affected: [],
    },
  ],
  summary: '',
  impacted_endpoints: ['POST /widgets'],
  impacted_crons: [],
  index_status: 'full' as const,
  degraded: false,
  reason: null,
};

describe('get_blast_radius', () => {
  it('resolves repo+pr and returns the mapped blast result on the happy path', async () => {
    const fetchMock = mockFetch([
      get('/repos', REPOS_FIXTURE),
      get('/repos/repo-1/pulls', PULLS_FIXTURE),
      get('/pulls/pr-42/blast', BASE_BLAST_RESPONSE),
    ]);

    const result = await getBlastRadiusTool.handler({ repo: 'acme/widgets', pr: 42 });
    expect(result.isError).toBeUndefined();

    const body = parse(result);
    expect(body.changed_symbols).toEqual(BASE_BLAST_RESPONSE.changed_symbols);
    expect(body.downstream).toHaveLength(1);
    expect(body.downstream[0].symbol).toBe('createWidget');
    expect(body.downstream[0].callers).toEqual(BASE_BLAST_RESPONSE.downstream[0]!.callers);
    expect(body.downstream[0].callers_total).toBe(1);
    expect(body.downstream[0].callers_truncated).toBe(false);
    expect(body.downstream_total).toBe(1);
    expect(body.downstream_truncated).toBe(false);
    expect(body.impacted_endpoints).toEqual(['POST /widgets']);
    expect(body.index_status).toBe('full');
    expect(body.degraded).toBe(false);

    // Confirms repo/pr resolution actually happened (not a raw uuid path):
    // fetch was called against the human-readable-resolved uuid path, via
    // the /repos and /repos/:id/pulls resolver calls.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('passes through a degraded/partial index payload without turning it into an error', async () => {
    mockFetch([
      get('/repos', REPOS_FIXTURE),
      get('/repos/repo-1/pulls', PULLS_FIXTURE),
      get('/pulls/pr-42/blast', {
        ...BASE_BLAST_RESPONSE,
        downstream: [],
        impacted_endpoints: [],
        index_status: 'degraded',
        degraded: true,
        reason: 'Repo index has not finished building yet.',
      }),
    ]);

    const result = await getBlastRadiusTool.handler({ repo: 'acme/widgets', pr: 42 });
    expect(result.isError).toBeUndefined();

    const body = parse(result);
    expect(body.index_status).toBe('degraded');
    expect(body.degraded).toBe(true);
    expect(body.reason).toBe('Repo index has not finished building yet.');
    expect(body.downstream).toEqual([]);
  });

  it('caps downstream entries and per-symbol callers when the payload is large', async () => {
    const manySymbolsDownstream = Array.from({ length: 25 }, (_, i) => ({
      symbol: `symbol${i}`,
      callers: Array.from({ length: 3 }, (_, j) => ({
        name: `caller${i}_${j}`,
        file: `src/file${i}.ts`,
        line: j + 1,
      })),
      endpoints_affected: [],
      crons_affected: [],
    }));
    // Make one symbol have many more callers than the per-symbol cap.
    manySymbolsDownstream[0]!.callers = Array.from({ length: 15 }, (_, j) => ({
      name: `bigCaller${j}`,
      file: 'src/hot-path.ts',
      line: j + 1,
    }));

    mockFetch([
      get('/repos', REPOS_FIXTURE),
      get('/repos/repo-1/pulls', PULLS_FIXTURE),
      get('/pulls/pr-42/blast', {
        ...BASE_BLAST_RESPONSE,
        downstream: manySymbolsDownstream,
      }),
    ]);

    const result = await getBlastRadiusTool.handler({ repo: 'acme/widgets', pr: 42 });
    expect(result.isError).toBeUndefined();

    const body = parse(result);
    // 25 downstream entries in, capped to 20.
    expect(body.downstream_total).toBe(25);
    expect(body.downstream_truncated).toBe(true);
    expect(body.downstream).toHaveLength(20);

    // The most-callers symbol (15 callers) survives the sort-by-impact cap
    // and its own callers list is capped to 10, with truncation signaled.
    const bigSymbol = body.downstream.find((d: any) => d.symbol === 'symbol0');
    expect(bigSymbol).toBeDefined();
    expect(bigSymbol.callers).toHaveLength(10);
    expect(bigSymbol.callers_total).toBe(15);
    expect(bigSymbol.callers_truncated).toBe(true);
  });

  it('error-forwards when the PR cannot be resolved', async () => {
    mockFetch([get('/repos', REPOS_FIXTURE), get('/repos/repo-1/pulls', PULLS_FIXTURE)]);

    const result = await getBlastRadiusTool.handler({ repo: 'acme/widgets', pr: 999 });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('PR #999 not found');
  });

  it('error-forwards when the blast endpoint itself fails (resolution succeeds, GET /blast 500s)', async () => {
    mockFetch([
      get('/repos', REPOS_FIXTURE),
      get('/repos/repo-1/pulls', PULLS_FIXTURE),
      get('/pulls/pr-42/blast', { error: { code: 'internal_error' } }, 500),
    ]);

    const result = await getBlastRadiusTool.handler({ repo: 'acme/widgets', pr: 42 });
    expect(result.isError).toBe(true);
    // Surfaces the upstream HTTP failure as a structured tool error, not a throw.
    expect(result.content[0]!.text).toContain('server error (500)');
  });
});
