/**
 * Shared clone walker — promoted from `repo-intel/pipeline/walk.ts` so any
 * module can walk a clone directory without cross-importing repo-intel's
 * internals (server CLAUDE.md module-isolation rule).
 *
 * Walks a clone directory and returns the set of files matching an extension
 * set, applying:
 *   - EXCLUDED_DIRS  (node_modules, dist, build, coverage, .next, out, vendor, .git)
 *   - extensions     (defaults to repo-intel's SUPPORTED_EXT — behavior-preserving
 *                    for the original repo-intel caller; pass a different set,
 *                    e.g. { extensions: new Set(['.md']) }, for other consumers)
 *   - MAX_FILE_SIZE  (400 KB) — files larger than this are counted in
 *                    `stats.skippedTooLarge` and left out of the result.
 *   - MAX_INDEXED_FILES (5000) — if exceeded, take the FIRST N (by walk order)
 *                    and record `stats.bounded = total - N`.
 *
 * Never follows symlinks (loop/escape safety) — a directory or file entry
 * that is a symlink is skipped outright, not resolved.
 *
 * Pure-ish: takes a root path + does fs ops; returns plain data so the caller
 * can decide what to do with it.
 */
import { readdir, stat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import {
  EXCLUDED_DIRS,
  MAX_FILE_SIZE,
  MAX_INDEXED_FILES,
  SUPPORTED_EXT,
} from '../repo-intel/constants.js';

const EXCLUDED_SET: ReadonlySet<string> = new Set(EXCLUDED_DIRS);
const DEFAULT_SUPPORTED_SET: ReadonlySet<string> = new Set(SUPPORTED_EXT);

export interface WalkStats {
  /** Files seen on disk with a matching extension (before size + bound filters). */
  totalCandidates: number;
  /** Candidates dropped because stat().size > MAX_FILE_SIZE. */
  skippedTooLarge: number;
  /** Candidates dropped because the file list exceeded MAX_INDEXED_FILES. */
  bounded: number;
}

export interface WalkResult {
  /** Paths relative to `root`, separator-normalized to forward slashes. */
  files: string[];
  stats: WalkStats;
}

export interface WalkOptions {
  /** Extensions to include (lowercase, with leading dot). Defaults to repo-intel's SUPPORTED_EXT. */
  extensions?: ReadonlySet<string>;
}

/**
 * Recursively walk `root`, returning the file set matching `options.extensions`
 * (default = repo-intel's SUPPORTED_EXT, so the original caller's behavior is
 * unchanged) + a small stats object.
 */
export async function walkClone(root: string, options?: WalkOptions): Promise<WalkResult> {
  const supportedSet = options?.extensions ?? DEFAULT_SUPPORTED_SET;
  const out: string[] = [];
  const stats: WalkStats = { totalCandidates: 0, skippedTooLarge: 0, bounded: 0 };

  await walkDir(root, root, out, stats, supportedSet);

  // Stable order: alphabetical relpath. Keeps "first N when bounded" reproducible
  // across runs.
  out.sort();

  if (out.length > MAX_INDEXED_FILES) {
    stats.bounded = out.length - MAX_INDEXED_FILES;
    out.length = MAX_INDEXED_FILES;
  }

  return { files: out, stats };
}

async function walkDir(
  root: string,
  dir: string,
  out: string[],
  stats: WalkStats,
  supportedSet: ReadonlySet<string>,
): Promise<void> {
  let entries: Dirent[];
  try {
    entries = (await readdir(dir, { withFileTypes: true })) as Dirent[];
  } catch {
    // Unreadable directory (permissions, dangling symlink) — skip cleanly so
    // the walk keeps making progress on the parts of the clone it CAN read.
    return;
  }

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue; // never follow symlinks (loops, escapes, perf)
    const name = entry.name;

    if (entry.isDirectory()) {
      if (EXCLUDED_SET.has(name)) continue;
      await walkDir(root, join(dir, name), out, stats, supportedSet);
      continue;
    }

    if (!entry.isFile()) continue;

    const ext = extname(name).toLowerCase();
    if (!supportedSet.has(ext)) continue;

    stats.totalCandidates += 1;

    const full = join(dir, name);
    let size: number;
    try {
      size = (await stat(full)).size;
    } catch {
      continue;
    }
    if (size > MAX_FILE_SIZE) {
      stats.skippedTooLarge += 1;
      continue;
    }

    // Posix-style relative path so callers get platform-agnostic paths.
    const rel = relative(root, full).split(sep).join('/');
    out.push(rel);
  }
}
