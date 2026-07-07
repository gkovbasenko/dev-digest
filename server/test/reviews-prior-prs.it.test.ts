import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import * as t from '../src/db/schema.js';
import { getPriorPrRows } from '../src/modules/reviews/repository/pull.repo.js';

/**
 * Integration coverage for `getPriorPrRows`' actual SQL — the hermetic
 * `reviews-prior-prs.test.ts` mocks the DB, so the real filters (repo scope,
 * exclude-current-PR, status='merged', path overlap) and the candidate cap are
 * only exercised here against a real Postgres. A regression in any of the
 * `and(...)` conditions or the `limit` would slip past the fake-DB tests.
 */
const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

d('getPriorPrRows (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoId: string;
  let otherRepoId: string;

  // PR ids we assert on.
  let currentId: string;
  let priorRecentId: string;
  let priorOldId: string;

  async function makePr(opts: {
    repo: string;
    number: number;
    status: string;
    updatedAt: Date | null;
    files: string[];
  }): Promise<string> {
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: opts.repo,
        number: opts.number,
        title: `PR ${opts.number}`,
        author: 'octocat',
        branch: `feat/${opts.number}`,
        base: 'main',
        headSha: `sha${opts.number}`,
        status: opts.status,
        updatedAt: opts.updatedAt,
      })
      .returning();
    if (opts.files.length > 0) {
      await pg.handle.db
        .insert(t.prFiles)
        .values(opts.files.map((path) => ({ prId: pr!.id, path })));
    }
    return pr!.id;
  }

  beforeAll(async () => {
    pg = await startPg();
    const [ws] = await pg.handle.db.insert(t.workspaces).values({ name: 'ws' }).returning();
    workspaceId = ws!.id;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'api', fullName: 'acme/api' })
      .returning();
    repoId = repo!.id;
    const [other] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'web', fullName: 'acme/web' })
      .returning();
    otherRepoId = other!.id;

    // The current PR: merged + overlapping — only the id!=current filter excludes it.
    currentId = await makePr({ repo: repoId, number: 1, status: 'merged', updatedAt: new Date('2026-03-01'), files: ['src/a.ts'] });
    // Two qualifying prior merged PRs (recent first by updatedAt).
    priorRecentId = await makePr({ repo: repoId, number: 2, status: 'merged', updatedAt: new Date('2026-02-01'), files: ['src/a.ts', 'src/b.ts'] });
    priorOldId = await makePr({ repo: repoId, number: 3, status: 'merged', updatedAt: new Date('2026-01-01'), files: ['src/b.ts'] });
    // Excluded: not merged.
    await makePr({ repo: repoId, number: 4, status: 'needs_review', updatedAt: new Date('2026-02-15'), files: ['src/a.ts'] });
    // Excluded: no overlapping path.
    await makePr({ repo: repoId, number: 5, status: 'merged', updatedAt: new Date('2026-02-20'), files: ['src/z.ts'] });
    // Excluded: different repo.
    await makePr({ repo: otherRepoId, number: 6, status: 'merged', updatedAt: new Date('2026-02-25'), files: ['src/a.ts'] });
  });

  afterAll(async () => {
    await pg?.stop();
  });

  it('returns only merged, same-repo, path-overlapping PRs excluding the current one', async () => {
    const rows = await getPriorPrRows(pg.handle.db, repoId, currentId, ['src/a.ts', 'src/b.ts'], 10);

    const idsByRow = new Set(rows.map((r) => r.prId));
    // Exactly the two qualifying prior PRs — never the current, the open,
    // the no-overlap, or the other-repo PR.
    expect(idsByRow).toEqual(new Set([priorRecentId, priorOldId]));
    expect(idsByRow.has(currentId)).toBe(false);

    // Overlap files are complete per PR: #2 overlaps both paths, #3 only src/b.ts.
    const pathsOf = (id: string) => new Set(rows.filter((r) => r.prId === id).map((r) => r.path));
    expect(pathsOf(priorRecentId)).toEqual(new Set(['src/a.ts', 'src/b.ts']));
    expect(pathsOf(priorOldId)).toEqual(new Set(['src/b.ts']));
  });

  it('caps the candidate PR set in SQL to the most-recently-updated `limit`', async () => {
    const rows = await getPriorPrRows(pg.handle.db, repoId, currentId, ['src/a.ts', 'src/b.ts'], 1);
    // limit=1 → only the most-recently-updated candidate (#2) survives, and its
    // overlap files are still complete (the cap is on PRs, not on joined rows).
    expect(new Set(rows.map((r) => r.prId))).toEqual(new Set([priorRecentId]));
    expect(new Set(rows.map((r) => r.path))).toEqual(new Set(['src/a.ts', 'src/b.ts']));
  });
});
