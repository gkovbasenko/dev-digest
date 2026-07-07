import { describe, it, expect } from 'vitest';
import * as t from '../src/db/schema.js';
import type { Container } from '../src/platform/container.js';
import type { PullRow } from '../src/db/rows.js';
import { groupPriorPrRows, type PriorPrFileRow } from '../src/modules/reviews/prior-prs/map.js';
import { ReviewService } from '../src/modules/reviews/service.js';
import { NotFoundError } from '../src/platform/errors.js';

/**
 * T5 unit coverage — the pure prior-PR grouping mapper (flat join rows ->
 * capped, grouped `PrHistoryItem[]`) and `ReviewService.getPriorPrs`
 * (container.db + repo mocked, no real DB/network/LLM).
 */

describe('groupPriorPrRows', () => {
  it('groups rows by PR and collects the overlapping files per PR', () => {
    const rows: PriorPrFileRow[] = [
      { prId: 'pr-a', number: 10, title: 'Fix auth', author: 'alice', updatedAt: new Date('2026-01-01'), path: 'src/auth.ts' },
      { prId: 'pr-a', number: 10, title: 'Fix auth', author: 'alice', updatedAt: new Date('2026-01-01'), path: 'src/session.ts' },
      { prId: 'pr-b', number: 11, title: 'Add caching', author: 'bob', updatedAt: new Date('2026-02-01'), path: 'src/auth.ts' },
    ];

    const result = groupPriorPrRows(rows, 10);

    expect(result).toEqual([
      {
        pr_number: 11,
        title: 'Add caching',
        merged_at: new Date('2026-02-01').toISOString(),
        author: 'bob',
        files_overlap: ['src/auth.ts'],
        notes: '',
      },
      {
        pr_number: 10,
        title: 'Fix auth',
        merged_at: new Date('2026-01-01').toISOString(),
        author: 'alice',
        files_overlap: ['src/auth.ts', 'src/session.ts'],
        notes: '',
      },
    ]);
  });

  it('orders most-recently-updated PR first', () => {
    const rows: PriorPrFileRow[] = [
      { prId: 'old', number: 1, title: 'Old', author: 'a', updatedAt: new Date('2020-01-01'), path: 'x.ts' },
      { prId: 'new', number: 2, title: 'New', author: 'b', updatedAt: new Date('2026-01-01'), path: 'x.ts' },
    ];
    const result = groupPriorPrRows(rows, 10);
    expect(result.map((r) => r.pr_number)).toEqual([2, 1]);
  });

  it('caps the result at the given limit', () => {
    const rows: PriorPrFileRow[] = Array.from({ length: 15 }, (_, i) => ({
      prId: `pr-${i}`,
      number: i,
      title: `PR ${i}`,
      author: 'a',
      updatedAt: new Date(2026, 0, i + 1),
      path: 'x.ts',
    }));
    const result = groupPriorPrRows(rows, 10);
    expect(result).toHaveLength(10);
    // Most recent 10 (highest day-of-month) kept, oldest dropped.
    expect(result.map((r) => r.pr_number)).toEqual([14, 13, 12, 11, 10, 9, 8, 7, 6, 5]);
  });

  it('falls back to an empty string merged_at when updatedAt is null', () => {
    const rows: PriorPrFileRow[] = [
      { prId: 'pr-a', number: 1, title: 'No timestamp', author: 'a', updatedAt: null, path: 'x.ts' },
    ];
    const result = groupPriorPrRows(rows, 10);
    expect(result[0]!.merged_at).toBe('');
  });

  it('returns an empty array for no rows', () => {
    expect(groupPriorPrRows([], 10)).toEqual([]);
  });
});

// ---- ReviewService.getPriorPrs ---------------------------------------------

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

/** Fake `container.db`: routes `.select()`/`.selectDistinct()` by table+chain.
 *  `select().from(t.pullRequests).where()` serves `getPull`; `select().from(
 *  t.prFiles).where()` serves `getPrFiles`; `select().from(t.prFiles)
 *  .innerJoin().where()` serves the prior-PR step-2 fetch. `selectDistinct()
 *  .from(t.pullRequests).innerJoin().where().orderBy().limit()` serves the
 *  prior-PR step-1 candidate cap — it returns the distinct (id, updatedAt) of
 *  the fake `priorRows`, mirroring the real bounded candidate query. */
function fakeDb(opts: {
  pull?: PullRow;
  files?: { path: string }[];
  priorRows?: PriorPrFileRow[];
}) {
  const distinctCandidates = [
    ...new Map(
      (opts.priorRows ?? []).map((r) => [r.prId, { id: r.prId, updatedAt: r.updatedAt }]),
    ).values(),
  ];
  return {
    select: () => ({
      from: (table: unknown) => {
        if (table === t.pullRequests) {
          return { where: async () => (opts.pull ? [opts.pull] : []) };
        }
        if (table === t.prFiles) {
          return {
            where: async () => opts.files ?? [],
            innerJoin: () => ({
              where: async () => opts.priorRows ?? [],
            }),
          };
        }
        return { where: async () => [] };
      },
    }),
    selectDistinct: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async (n: number) => distinctCandidates.slice(0, n),
            }),
          }),
        }),
      }),
    }),
  };
}

function fakeContainer(opts: {
  pull?: PullRow;
  files?: { path: string }[];
  priorRows?: PriorPrFileRow[];
}): Container {
  return {
    db: fakeDb(opts),
    agentsRepo: {},
  } as unknown as Container;
}

describe('ReviewService.getPriorPrs', () => {
  it('short-circuits to an empty history when the PR has no changed files', async () => {
    const container = fakeContainer({ pull: fakePull(), files: [] });
    const service = new ReviewService(container);
    const result = await service.getPriorPrs('ws-1', 'pr-1');
    expect(result).toEqual({ history: [] });
  });

  it('excludes the current PR and filters to overlapping files, capped and grouped', async () => {
    const container = fakeContainer({
      pull: fakePull({ repoId: 'repo-1' }),
      files: [{ path: 'src/a.ts' }, { path: 'src/b.ts' }],
      priorRows: [
        {
          prId: 'pr-2',
          number: 7,
          title: 'Earlier change',
          author: 'jane',
          updatedAt: new Date('2026-01-01'),
          path: 'src/a.ts',
        },
      ],
    });

    const service = new ReviewService(container);
    const result = await service.getPriorPrs('ws-1', 'pr-1');

    expect(result.history).toEqual([
      {
        pr_number: 7,
        title: 'Earlier change',
        merged_at: new Date('2026-01-01').toISOString(),
        author: 'jane',
        files_overlap: ['src/a.ts'],
        notes: '',
      },
    ]);
  });

  it('throws NotFoundError when the pull is missing', async () => {
    const container = fakeContainer({ pull: undefined });
    const service = new ReviewService(container);
    await expect(service.getPriorPrs('ws-1', 'missing-pr')).rejects.toThrow(NotFoundError);
  });
});
