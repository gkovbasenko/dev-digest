/**
 * Shared clone-read boundary — promoted from `conventions/helpers.ts` +
 * `conventions/service.ts` so any module (conventions, the Project Context
 * discovery module, run-executor) can read a file from a repo clone without
 * cross-importing another module's internals (server CLAUDE.md rule).
 *
 * Containment requires BOTH a syntactic check (resolveClonePath/isWithinRoot)
 * AND a realpath-based symlink check (resolveRealClonePath) — the syntactic
 * check alone stops `../`-style traversal but NOT a symlink committed inside
 * the clone that points outside it (git can commit symlinks; checkout
 * materializes them as real filesystem symlinks). resolveRealClonePath is
 * the actual read boundary — see server INSIGHTS 2026-07-02.
 *
 * `readCloneFile` additionally `stat`s the real path and refuses to read
 * anything over `MAX_READ_FILE_SIZE` — unlike `walkClone` (which drops
 * >400KB files during discovery), this read path is also reachable with a
 * client-submitted or previously-stored path (attach-validate, preview,
 * run-time injection) that never went through discovery's size filter. A
 * large committed file would otherwise be read fully into a Node string
 * before any token/cap check runs, risking memory exhaustion under
 * concurrency (S4).
 */
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

/**
 * Hard cap on bytes `readCloneFile` will read into memory. 2 MiB is
 * comfortably larger than any legitimate markdown/config doc this boundary
 * is meant to serve, while still bounding worst-case memory per read.
 */
export const MAX_READ_FILE_SIZE = 2 * 1024 * 1024;

/**
 * Is `candidate` equal to `root`, or nested inside it? Both should already be
 * resolved/absolute (via `resolve()`/`realpath()`, which never leave a
 * trailing separator except for the filesystem root itself) — a trailing
 * separator on `root` is stripped defensively anyway, since `candidate`
 * matching `root + sep` would otherwise double up (`/a/b/` + sep = `/a/b//`,
 * which no real resolved path starts with) and wrongly reject everything.
 */
export function isWithinRoot(root: string, candidate: string): boolean {
  const normalizedRoot = root.length > sep.length && root.endsWith(sep) ? root.slice(0, -sep.length) : root;
  return candidate === normalizedRoot || candidate.startsWith(normalizedRoot + sep);
}

/**
 * Resolve `file` against `clonePath` and return the resolved absolute path,
 * or null if it would escape the clone directory (path traversal via `../`,
 * or an absolute path that overrides the base entirely). This is a purely
 * syntactic check — it does NOT follow symlinks, so it does not by itself
 * defend against a symlink committed inside the clone that points outside
 * it (a git repo can commit one; checkout materializes it as a real
 * symlink). Callers that actually read the file must additionally realpath
 * the result and re-check containment — see `resolveRealClonePath`, the
 * actual read boundary.
 */
export function resolveClonePath(clonePath: string, file: string): string | null {
  const root = resolve(clonePath);
  const resolved = resolve(root, file);
  return isWithinRoot(root, resolved) ? resolved : null;
}

/**
 * resolveClonePath alone is a syntactic check — it doesn't touch the
 * filesystem, so it can't catch a symlink committed INSIDE the clone that
 * points OUTSIDE it (`git clone` materializes a committed symlink as a real
 * one on checkout). realpath() resolves every symlink in the chain to its
 * true target, so re-checking containment against the real paths is the
 * actual read boundary.
 */
export async function resolveRealClonePath(clonePath: string, file: string): Promise<string | null> {
  const resolved = resolveClonePath(clonePath, file);
  if (!resolved) return null;
  try {
    const [root, real] = await Promise.all([realpath(clonePath), realpath(resolved)]);
    return isWithinRoot(root, real) ? real : null;
  } catch {
    return null; // doesn't exist, broken symlink, permission error, etc.
  }
}

/**
 * Read a file from a clone through the realpath-contained boundary; null on
 * escape/miss/oversize. Refuses to read files over `MAX_READ_FILE_SIZE`
 * (S4) — a size-bounded backstop shared by every caller (attach-validate,
 * preview, run-time injection), since none of them re-derive the
 * discovery-time 400KB `walkClone` filter for a path they didn't just walk.
 */
export async function readCloneFile(clonePath: string, file: string): Promise<string | null> {
  const real = await resolveRealClonePath(clonePath, file);
  if (!real) return null;
  try {
    const { size } = await stat(real);
    if (size > MAX_READ_FILE_SIZE) return null;
  } catch {
    return null; // vanished between realpath and stat, permission error, etc.
  }
  return readFile(real, 'utf8').catch(() => null);
}
