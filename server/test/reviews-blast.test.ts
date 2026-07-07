import { describe, it, expect } from 'vitest';
import * as t from '../src/db/schema.js';
import type { Container } from '../src/platform/container.js';
import type { PullRow } from '../src/db/rows.js';
import type { BlastResult, IndexState } from '../src/modules/repo-intel/types.js';
import { toPrBlastResponse } from '../src/modules/reviews/blast/map.js';
import { ReviewService } from '../src/modules/reviews/service.js';
import { NotFoundError } from '../src/platform/errors.js';

/**
 * T2 unit coverage — the pure blast mapper (facade `BlastResult` → contract
 * shape) and `ReviewService.getBlast` (container.repoIntel + repo mocked, no
 * DB/network/LLM).
 */

function indexState(overrides: Partial<IndexState> = {}): IndexState {
  return {
    repoId: 'repo-1',
    status: 'full',
    filesIndexed: 10,
    filesSkipped: 0,
    durationMs: 100,
    lastIndexedSha: 'abc123',
    indexerVersion: 1,
    updatedAt: new Date(0),
    ...overrides,
  };
}

describe('toPrBlastResponse', () => {
  it('groups callers by the changed symbol they reach, unioning endpoints/crons per group', () => {
    const blast: BlastResult = {
      changedSymbols: [
        { file: 'src/a.ts', name: 'foo', kind: 'function' },
        { file: 'src/a.ts', name: 'bar', kind: 'function' },
      ],
      callers: [
        { file: 'src/x.ts', symbol: 'callerX', viaSymbol: 'foo', line: 10, rank: 5 },
        { file: 'src/y.ts', symbol: 'callerY', viaSymbol: 'foo', line: 20, rank: 3 },
        { file: 'src/z.ts', symbol: 'callerZ', viaSymbol: 'bar', line: 30, rank: 1 },
      ],
      impactedEndpoints: [],
      factsByFile: {
        'src/x.ts': { endpoints: ['GET /a'], crons: [] },
        'src/y.ts': { endpoints: ['GET /a', 'POST /b'], crons: ['nightly'] },
        'src/z.ts': { endpoints: [], crons: ['hourly'] },
      },
      degraded: false,
    };

    const result = toPrBlastResponse(blast, indexState());

    expect(result.changed_symbols).toEqual([
      { name: 'foo', file: 'src/a.ts', kind: 'function' },
      { name: 'bar', file: 'src/a.ts', kind: 'function' },
    ]);

    const foo = result.downstream.find((d) => d.symbol === 'foo')!;
    expect(foo.callers).toEqual([
      { name: 'callerX', file: 'src/x.ts', line: 10 },
      { name: 'callerY', file: 'src/y.ts', line: 20 },
    ]);
    // Union across foo's two caller files, deduped ('GET /a' appears in both).
    expect(foo.endpoints_affected.sort()).toEqual(['GET /a', 'POST /b']);
    expect(foo.crons_affected).toEqual(['nightly']);

    const bar = result.downstream.find((d) => d.symbol === 'bar')!;
    expect(bar.callers).toEqual([{ name: 'callerZ', file: 'src/z.ts', line: 30 }]);
    expect(bar.endpoints_affected).toEqual([]);
    expect(bar.crons_affected).toEqual(['hourly']);
  });

  it('gives a changed symbol with no callers an empty downstream entry', () => {
    const blast: BlastResult = {
      changedSymbols: [{ file: 'src/a.ts', name: 'lonely', kind: 'function' }],
      callers: [],
      impactedEndpoints: [],
      degraded: false,
    };

    const result = toPrBlastResponse(blast, indexState());
    expect(result.downstream).toEqual([
      { symbol: 'lonely', callers: [], endpoints_affected: [], crons_affected: [] },
    ]);
  });

  it('leaves a caller\'s endpoints/crons empty when its file is absent from factsByFile', () => {
    const blast: BlastResult = {
      changedSymbols: [{ file: 'src/a.ts', name: 'foo', kind: 'function' }],
      callers: [{ file: 'src/x.ts', symbol: 'cx', viaSymbol: 'foo', line: 1, rank: 0 }],
      impactedEndpoints: [],
      // factsByFile is present, but has no entry for the caller's file (src/x.ts).
      factsByFile: { 'src/other.ts': { endpoints: ['GET /other'], crons: ['nightly'] } },
      degraded: false,
    };
    const result = toPrBlastResponse(blast, indexState());
    expect(result.downstream[0]!.endpoints_affected).toEqual([]);
    expect(result.downstream[0]!.crons_affected).toEqual([]);
    expect(result.impacted_endpoints).toEqual([]);
    expect(result.impacted_crons).toEqual([]);
  });

  it('unions impacted_endpoints / impacted_crons flat and deduped across all downstream groups', () => {
    const blast: BlastResult = {
      changedSymbols: [
        { file: 'src/a.ts', name: 'foo', kind: 'function' },
        { file: 'src/b.ts', name: 'bar', kind: 'function' },
      ],
      callers: [
        { file: 'src/x.ts', symbol: 'cx', viaSymbol: 'foo', line: 1, rank: 1 },
        { file: 'src/y.ts', symbol: 'cy', viaSymbol: 'bar', line: 2, rank: 1 },
      ],
      impactedEndpoints: [],
      factsByFile: {
        'src/x.ts': { endpoints: ['GET /shared'], crons: ['shared-cron'] },
        'src/y.ts': { endpoints: ['GET /shared', 'POST /only-bar'], crons: ['shared-cron'] },
      },
      degraded: false,
    };

    const result = toPrBlastResponse(blast, indexState());
    expect(result.impacted_endpoints.sort()).toEqual(['GET /shared', 'POST /only-bar']);
    expect(result.impacted_crons).toEqual(['shared-cron']);
  });

  it('degraded path with no factsByFile yields empty endpoints/crons everywhere and a human reason', () => {
    const blast: BlastResult = {
      changedSymbols: [{ file: 'src/a.ts', name: 'foo', kind: 'function' }],
      callers: [{ file: 'src/x.ts', symbol: 'cx', viaSymbol: 'foo', line: 1, rank: 0 }],
      impactedEndpoints: [],
      // no factsByFile — the ripgrep/degraded path.
      degraded: true,
      reason: 'no_data',
    };
    const state = indexState({ status: 'degraded', degraded: true, degradedReason: 'no_data' });

    const result = toPrBlastResponse(blast, state);
    expect(result.downstream[0]!.endpoints_affected).toEqual([]);
    expect(result.downstream[0]!.crons_affected).toEqual([]);
    expect(result.impacted_endpoints).toEqual([]);
    expect(result.impacted_crons).toEqual([]);
    expect(result.index_status).toBe('degraded');
    expect(result.degraded).toBe(true);
    expect(result.reason).toBe('No index data is available for this repo yet.');
  });

  it('falls back to the raw reason code when the DegradedReason is not enumerated', () => {
    // Forward-compat: a reason the mapper doesn't have a human message for yet
    // must surface as its raw code, never vanish (reasonMessage's `?? reason`).
    const blast: BlastResult = {
      changedSymbols: [],
      callers: [],
      impactedEndpoints: [],
      degraded: true,
      reason: 'some_future_reason' as unknown as BlastResult['reason'],
    };
    const result = toPrBlastResponse(blast, indexState({ status: 'degraded' }));
    expect(result.reason).toBe('some_future_reason');
  });

  it('derives degraded from index status when the facade result omits it', () => {
    const blast: BlastResult = {
      changedSymbols: [],
      callers: [],
      impactedEndpoints: [],
    };
    const result = toPrBlastResponse(blast, indexState({ status: 'partial' }));
    expect(result.degraded).toBe(true);
    expect(result.index_status).toBe('partial');
  });

  it('is not degraded when both the facade result and index state say full/false', () => {
    const blast: BlastResult = {
      changedSymbols: [],
      callers: [],
      impactedEndpoints: [],
      degraded: false,
    };
    const result = toPrBlastResponse(blast, indexState({ status: 'full' }));
    expect(result.degraded).toBe(false);
    expect(result.reason).toBeNull();
  });

  it('stays degraded on a partial index even when the facade flag is an explicit false', () => {
    // Regression: `blast.degraded ?? …` would let an explicit `false` mask a
    // partial index (`??` only falls back on null/undefined). A partial/failed
    // index must always surface as degraded so the UI shows the badge.
    const blast: BlastResult = {
      changedSymbols: [],
      callers: [],
      impactedEndpoints: [],
      degraded: false,
    };
    const result = toPrBlastResponse(
      blast,
      indexState({ status: 'partial', degradedReason: 'index_partial' }),
    );
    expect(result.index_status).toBe('partial');
    expect(result.degraded).toBe(true);
    expect(result.reason).toBe('This repo is only partially indexed.');
  });
});

// ---- ReviewService.getBlast -------------------------------------------------

function fakePull(overrides: Partial<PullRow> = {}): PullRow {
  return {
    id: 'pr-1',
    workspaceId: 'ws-1',
    repoId: 'repo-1',
    number: 42,
    title: 'Add rate limiting',
    author: 'octocat',
    branch: 'feature/x',
    base: 'main',
    headSha: 'sha123',
    lastReviewedSha: null,
    additions: 10,
    deletions: 2,
    filesCount: 1,
    status: 'needs_review',
    body: null,
    openedAt: null,
    updatedAt: null,
    ...overrides,
  } as PullRow;
}

/** Fake `container.db`: routes `.select().from(table).where(...)` by table identity. */
function fakeDb(opts: { pull?: PullRow; files?: { path: string }[] }) {
  return {
    select: () => ({
      from: (table: unknown) => ({
        where: async () => {
          if (table === t.pullRequests) return opts.pull ? [opts.pull] : [];
          if (table === t.prFiles) return opts.files ?? [];
          return [];
        },
      }),
    }),
  };
}

function fakeContainer(opts: {
  pull?: PullRow;
  files?: { path: string }[];
  getBlastRadius: (repoId: string, changedFiles: string[]) => Promise<BlastResult>;
  getIndexState: (repoId: string) => Promise<IndexState>;
}): Container {
  return {
    db: fakeDb({ pull: opts.pull, files: opts.files }),
    agentsRepo: {},
    repoIntel: {
      getBlastRadius: opts.getBlastRadius,
      getIndexState: opts.getIndexState,
    },
  } as unknown as Container;
}

describe('ReviewService.getBlast', () => {
  it('reads changed files from persisted pr_files and maps the facade result', async () => {
    const pull = fakePull();
    const blastCalls: { repoId: string; changedFiles: string[] }[] = [];
    const stateCalls: string[] = [];

    const container = fakeContainer({
      pull,
      files: [{ path: 'src/a.ts' }, { path: 'src/b.ts' }],
      getBlastRadius: async (repoId, changedFiles) => {
        blastCalls.push({ repoId, changedFiles });
        return {
          changedSymbols: [{ file: 'src/a.ts', name: 'foo', kind: 'function' }],
          callers: [],
          impactedEndpoints: [],
          degraded: false,
        };
      },
      getIndexState: async (repoId) => {
        stateCalls.push(repoId);
        return indexState({ status: 'full' });
      },
    });

    const service = new ReviewService(container);
    const result = await service.getBlast('ws-1', 'pr-1');

    expect(blastCalls).toEqual([{ repoId: 'repo-1', changedFiles: ['src/a.ts', 'src/b.ts'] }]);
    expect(stateCalls).toEqual(['repo-1']);
    expect(result.changed_symbols).toEqual([{ name: 'foo', file: 'src/a.ts', kind: 'function' }]);
    expect(result.downstream).toEqual([
      { symbol: 'foo', callers: [], endpoints_affected: [], crons_affected: [] },
    ]);
    expect(result.summary).toBe('');
    expect(result.index_status).toBe('full');
    expect(result.degraded).toBe(false);
  });

  it('handles a PR with no persisted files: calls the facade with an empty changedFiles list', async () => {
    const blastCalls: { repoId: string; changedFiles: string[] }[] = [];
    const container = fakeContainer({
      pull: fakePull(),
      files: [], // no persisted pr_files (e.g. detail never loaded)
      getBlastRadius: async (repoId, changedFiles) => {
        blastCalls.push({ repoId, changedFiles });
        return { changedSymbols: [], callers: [], impactedEndpoints: [], degraded: true, reason: 'no_data' };
      },
      getIndexState: async () => indexState({ status: 'degraded', degradedReason: 'no_data' }),
    });

    const service = new ReviewService(container);
    const result = await service.getBlast('ws-1', 'pr-1');

    expect(blastCalls).toEqual([{ repoId: 'repo-1', changedFiles: [] }]);
    expect(result.changed_symbols).toEqual([]);
    expect(result.downstream).toEqual([]);
    expect(result.impacted_endpoints).toEqual([]);
    expect(result.degraded).toBe(true);
    expect(result.reason).toBe('No index data is available for this repo yet.');
  });

  it('throws NotFoundError when the pull is missing', async () => {
    const container = fakeContainer({
      pull: undefined,
      files: [],
      getBlastRadius: async () => {
        throw new Error('must not be called when the pull is missing');
      },
      getIndexState: async () => {
        throw new Error('must not be called when the pull is missing');
      },
    });

    const service = new ReviewService(container);
    await expect(service.getBlast('ws-1', 'missing-pr')).rejects.toThrow(NotFoundError);
  });
});
