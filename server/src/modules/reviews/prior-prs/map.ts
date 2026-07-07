import type { PrHistoryItem } from '@devdigest/shared';

/**
 * One row per (prior PR, overlapping file) — the flat join result before
 * grouping. `updatedAt` doubles as the "merged at" timestamp: `pull_requests`
 * has no dedicated merge-timestamp column, only a `status` column that the
 * GitHub import path already sets to `'merged'` via `mapStatus`
 * (`server/src/adapters/github/octokit.ts:19`) whenever `pr.merged_at` is
 * present upstream. So the query filters `status = 'merged'`, and this
 * mapper derives the contract's `merged_at` from `updated_at`.
 */
export interface PriorPrFileRow {
  prId: string;
  number: number;
  title: string;
  author: string;
  updatedAt: Date | null;
  path: string;
}

/**
 * Pure mapper: flat join rows (one per PR x overlapping file) -> grouped,
 * capped `PrHistoryItem[]`, most-recently-updated PR first. No I/O —
 * everything here is already-fetched data.
 */
export function groupPriorPrRows(rows: PriorPrFileRow[], limit: number): PrHistoryItem[] {
  const byPr = new Map<
    string,
    { number: number; title: string; author: string; updatedAt: Date | null; files: Set<string> }
  >();

  for (const row of rows) {
    const existing = byPr.get(row.prId);
    if (existing) {
      existing.files.add(row.path);
    } else {
      byPr.set(row.prId, {
        number: row.number,
        title: row.title,
        author: row.author,
        updatedAt: row.updatedAt,
        files: new Set([row.path]),
      });
    }
  }

  return [...byPr.values()]
    .sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0))
    .slice(0, limit)
    .map((pr) => ({
      pr_number: pr.number,
      title: pr.title,
      merged_at: pr.updatedAt ? pr.updatedAt.toISOString() : '',
      author: pr.author,
      files_overlap: [...pr.files],
      notes: '',
    }));
}
