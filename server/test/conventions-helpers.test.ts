import { describe, it, expect } from 'vitest';
import { sep, join } from 'node:path';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { verifyEvidence, resolveClonePath, isWithinRoot } from '../src/modules/conventions/helpers.js';
import { resolveRealClonePath } from '../src/modules/conventions/service.js';

/**
 * Unit coverage for verifyEvidence — the code-level check that drops any
 * LLM-claimed convention candidate whose evidence doesn't actually exist in
 * the repo file. This is the boundary that prevents hallucinated candidates
 * from ever reaching the DB/UI.
 */

const FILE = ['export function foo() {', '  return 1;', '}', '', 'export const bar = 2;'].join(
  '\n',
);

describe('verifyEvidence', () => {
  it('accepts a snippet found exactly on the claimed line', () => {
    expect(verifyEvidence(FILE, 2, 'return 1;').ok).toBe(true);
  });

  it('accepts a snippet found within the window around an off-by-a-few line number', () => {
    // Claimed line 1, snippet actually on line 2 — within the small window models often miss by.
    expect(verifyEvidence(FILE, 1, 'return 1;').ok).toBe(true);
  });

  it('rejects when the line number is out of range', () => {
    const check = verifyEvidence(FILE, 999, 'return 1;');
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/out of range/);
  });

  it('rejects when the line number is zero or negative', () => {
    expect(verifyEvidence(FILE, 0, 'return 1;').ok).toBe(false);
  });

  it('rejects when the snippet is not present anywhere near the claimed line', () => {
    const check = verifyEvidence(FILE, 2, 'this text does not exist in the file');
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/not found/);
  });

  it('rejects an empty snippet', () => {
    const check = verifyEvidence(FILE, 2, '   ');
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/empty/);
  });

  it('rejects any claim against empty file content', () => {
    const check = verifyEvidence('', 1, 'anything');
    expect(check.ok).toBe(false);
  });

  it('handles a single-line file without an off-by-one error', () => {
    expect(verifyEvidence('const x = 1;', 1, 'const x = 1;').ok).toBe(true);
    expect(verifyEvidence('const x = 1;', 1, 'nonexistent').ok).toBe(false);
  });
});

/**
 * Window-boundary precision for verifyEvidence, using a file large enough
 * (10 lines, EVIDENCE_WINDOW=3) that lo/hi actually exclude real lines —
 * the 5-line FILE above never exercises this since EVIDENCE_WINDOW alone
 * already covers nearly all of it. slice(lo, hi) is a lossless reconstruction
 * of a contiguous run of complete lines (split('\n') never truncates a
 * line's content, and join('\n') on a contiguous slice reproduces exactly
 * that span of the original file) — so this isn't probing for a join
 * artifact, it's probing that lo/hi are computed and applied correctly.
 */
describe('verifyEvidence — window boundary precision', () => {
  const LONG_FILE = Array.from({ length: 10 }, (_, i) => `line${i}`).join('\n');

  it('accepts a snippet on the last line included in the window (upper bound, inclusive)', () => {
    // claimed line=1 -> lo=0, hi=4 -> window is 1-indexed lines 1..4 ("line0".."line3")
    expect(verifyEvidence(LONG_FILE, 1, 'line3').ok).toBe(true);
  });

  it('rejects a snippet one line past the window (upper bound, exclusive)', () => {
    expect(verifyEvidence(LONG_FILE, 1, 'line4').ok).toBe(false);
  });

  it('accepts a snippet on the first line included in the window (lower bound, inclusive)', () => {
    // claimed line=8 -> lo=4, hi=10 -> window is 1-indexed lines 5..10 ("line4".."line9")
    expect(verifyEvidence(LONG_FILE, 8, 'line4').ok).toBe(true);
  });

  it('rejects a snippet one line before the window (lower bound, exclusive)', () => {
    expect(verifyEvidence(LONG_FILE, 8, 'line3').ok).toBe(false);
  });
});

/**
 * Unit coverage for resolveClonePath — the path-containment guard that stops
 * an LLM-claimed `evidence_path` (untrusted structured-output data) from
 * escaping the repo's clone directory via `../` traversal or an absolute
 * path override, before any filesystem read ever touches it.
 */
describe('resolveClonePath', () => {
  const CLONE = '/tmp/dd-clones/acme-repo';

  it('resolves a normal relative path inside the clone', () => {
    const resolved = resolveClonePath(CLONE, 'src/modules/foo/service.ts');
    expect(resolved).toBe(`${CLONE}${sep}src${sep}modules${sep}foo${sep}service.ts`);
  });

  it('resolves a path that dips into ".." but stays within the clone', () => {
    const resolved = resolveClonePath(CLONE, 'src/modules/../modules/foo/service.ts');
    expect(resolved).toBe(`${CLONE}${sep}src${sep}modules${sep}foo${sep}service.ts`);
  });

  it('rejects a relative traversal that escapes the clone directory', () => {
    expect(resolveClonePath(CLONE, '../../../../etc/passwd')).toBeNull();
  });

  it('rejects an absolute path that overrides the clone root entirely', () => {
    expect(resolveClonePath(CLONE, '/etc/passwd')).toBeNull();
  });

  it('rejects a sibling directory that merely shares the clone dir as a string prefix', () => {
    // "/tmp/dd-clones/acme-repo-evil" starts with the CLONE string but is NOT
    // inside it — a naive `.startsWith(root)` (no trailing separator) would
    // wrongly allow this.
    expect(resolveClonePath(CLONE, '../acme-repo-evil/secret.env')).toBeNull();
  });

  it('allows the clone root itself (e.g. a "." path)', () => {
    expect(resolveClonePath(CLONE, '.')).toBe(CLONE);
  });
});

/**
 * Direct unit coverage for isWithinRoot — resolveClonePath/resolveRealClonePath
 * both call it with already-normalized (resolve()/realpath()) inputs, which
 * never carry a trailing separator, so this exercises it in isolation
 * including the input shape its two current callers never actually produce.
 */
describe('isWithinRoot', () => {
  const ROOT = '/tmp/dd-clones/acme-repo';

  it('is true when the candidate equals the root exactly', () => {
    expect(isWithinRoot(ROOT, ROOT)).toBe(true);
  });

  it('is true when the candidate is nested under the root', () => {
    expect(isWithinRoot(ROOT, `${ROOT}${sep}src${sep}foo.ts`)).toBe(true);
  });

  it('is false when the candidate is a sibling that shares the root as a string prefix', () => {
    expect(isWithinRoot(ROOT, `${ROOT}-evil${sep}secret.env`)).toBe(false);
  });

  it('is false when the candidate is a parent of the root', () => {
    expect(isWithinRoot(ROOT, '/tmp/dd-clones')).toBe(false);
  });

  it('still matches correctly when root is passed with a trailing separator', () => {
    // Neither resolve() nor realpath() ever produce this shape for a real
    // directory, but isWithinRoot normalizes defensively — root + sep would
    // otherwise double up ("/a/b/" + sep = "/a/b//"), which no real resolved
    // path starts with, silently rejecting everything.
    const trailing = `${ROOT}${sep}`;
    expect(isWithinRoot(trailing, `${ROOT}${sep}src${sep}foo.ts`)).toBe(true);
    expect(isWithinRoot(trailing, trailing)).toBe(true);
  });

  it('does not collapse a trailing-separator-only root ("/") to an empty-string bypass', () => {
    // A naive strip-trailing-sep would turn root="/" into "", and
    // "".startsWith("/") would then be true for every absolute path —
    // a complete containment bypass. Guard against that specific collapse.
    expect(isWithinRoot(sep, `${sep}etc${sep}passwd`)).toBe(false);
    expect(isWithinRoot(sep, sep)).toBe(true);
  });
});

/**
 * Unit coverage for resolveRealClonePath — resolveClonePath is purely
 * syntactic (string manipulation, no filesystem access), so it cannot catch
 * a symlink planted INSIDE the clone that points OUTSIDE it. A git repo can
 * commit a symlink (mode 120000); `git clone` materializes it as a real
 * symlink on checkout. resolveRealClonePath is the actual read boundary —
 * it realpaths the resolved path and re-checks containment against the
 * real (symlink-resolved) target, not just the syntactic one.
 */
describe('resolveRealClonePath', () => {
  it('resolves a normal file inside the clone to its real path', async () => {
    const clonePath = await mkdtemp(join(tmpdir(), 'dd-realpath-'));
    try {
      await writeFile(join(clonePath, 'file.txt'), 'hello', 'utf8');
      const real = await resolveRealClonePath(clonePath, 'file.txt');
      expect(real).not.toBeNull();
      expect(real).toContain('file.txt');
    } finally {
      await rm(clonePath, { recursive: true, force: true });
    }
  });

  it('rejects a symlink inside the clone that points to a file outside it', async () => {
    const clonePath = await mkdtemp(join(tmpdir(), 'dd-realpath-'));
    const outsideDir = await mkdtemp(join(tmpdir(), 'dd-outside-'));
    try {
      const secretPath = join(outsideDir, 'secret.txt');
      await writeFile(secretPath, 'SECRET_TOKEN', 'utf8');
      // A repo can commit a symlink (git mode 120000) that checkout
      // materializes as a real one — simulate that here.
      await symlink(secretPath, join(clonePath, 'evil-link.txt'));

      const real = await resolveRealClonePath(clonePath, 'evil-link.txt');
      expect(real).toBeNull();
    } finally {
      await rm(clonePath, { recursive: true, force: true });
      await rm(outsideDir, { recursive: true, force: true });
    }
  });

  it('rejects a symlinked directory inside the clone whose target escapes it', async () => {
    const clonePath = await mkdtemp(join(tmpdir(), 'dd-realpath-'));
    const outsideDir = await mkdtemp(join(tmpdir(), 'dd-outside-'));
    try {
      await writeFile(join(outsideDir, 'secret.txt'), 'SECRET_TOKEN', 'utf8');
      await symlink(outsideDir, join(clonePath, 'linked-dir'), 'dir');

      const real = await resolveRealClonePath(clonePath, 'linked-dir/secret.txt');
      expect(real).toBeNull();
    } finally {
      await rm(clonePath, { recursive: true, force: true });
      await rm(outsideDir, { recursive: true, force: true });
    }
  });

  it('returns null for a nonexistent file (not an exception)', async () => {
    const clonePath = await mkdtemp(join(tmpdir(), 'dd-realpath-'));
    try {
      expect(await resolveRealClonePath(clonePath, 'does/not/exist.ts')).toBeNull();
    } finally {
      await rm(clonePath, { recursive: true, force: true });
    }
  });

  it('still rejects a syntactic traversal (delegates to resolveClonePath first)', async () => {
    const clonePath = await mkdtemp(join(tmpdir(), 'dd-realpath-'));
    try {
      expect(await resolveRealClonePath(clonePath, '../../../../etc/passwd')).toBeNull();
    } finally {
      await rm(clonePath, { recursive: true, force: true });
    }
  });
});
