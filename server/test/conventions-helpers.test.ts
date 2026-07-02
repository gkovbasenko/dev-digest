import { describe, it, expect } from 'vitest';
import { sep, join } from 'node:path';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {
  verifyEvidence,
  resolveClonePath,
  isWithinRoot,
  buildSkillBody,
  buildConventionsPrompt,
} from '../src/modules/conventions/helpers.js';
import { resolveRealClonePath } from '../src/modules/conventions/service.js';
import type { ConventionRow } from '../src/db/rows.js';

function mkRow(overrides: Partial<ConventionRow>): ConventionRow {
  return {
    id: 'c1',
    workspaceId: 'ws1',
    repoId: 'repo1',
    rule: 'a rule',
    category: null,
    evidencePath: null,
    evidenceSnippet: null,
    evidenceLine: null,
    confidence: null,
    acceptedAt: null,
    rejectedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

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

  it('accepts a multi-line snippet that spans exactly the lines it claims to', () => {
    // Nothing in the schema stops the LLM from citing a multi-line block —
    // the window is joined with the same '\n' the snippet would contain, so
    // a snippet spanning two real, contiguous lines should still match.
    expect(verifyEvidence(FILE, 2, '  return 1;\n}').ok).toBe(true);
  });

  it('rejects a multi-line snippet that does not appear in the file', () => {
    expect(verifyEvidence(FILE, 2, 'return 1;\nsomething else entirely').ok).toBe(false);
  });

  it('matches single-line snippets in a CRLF file (trailing \\r does not break the substring match)', () => {
    const crlfFile = FILE.replace(/\n/g, '\r\n');
    expect(verifyEvidence(crlfFile, 2, 'return 1;').ok).toBe(true);
  });

  it('matches a multi-line snippet in a CRLF file — this is the case that actually breaks without normalization', () => {
    // Without normalizing \r\n -> \n first, the reconstructed window text
    // keeps the \r as part of the prior line ("...\r\nnextline"), but the
    // LLM's snippet won't contain \r, so a bare '\n' in the needle wouldn't
    // line up against the CRLF-preserved window text.
    const crlfFile = FILE.replace(/\n/g, '\r\n');
    expect(verifyEvidence(crlfFile, 2, '  return 1;\n}').ok).toBe(true);
  });

  it('rejects a non-integer line number', () => {
    // The LLM output schema already enforces z.number().int(), but a schema
    // change or bypass could let a float through — verifyEvidence's own
    // Number.isInteger guard is the last line of defense.
    expect(verifyEvidence(FILE, 1.5, 'return 1;').ok).toBe(false);
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

  it('treats an empty file path as the clone root itself', () => {
    // Not reachable from the LLM output today (the schema requires
    // evidence_path min(1)), but documents the actual behavior in case a
    // future caller passes an unvalidated/empty path.
    expect(resolveClonePath(CLONE, '')).toBe(CLONE);
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

  it('resolves a symlink inside the clone that points to another file inside it (positive control)', async () => {
    // The negative-control tests below prove escaping symlinks are rejected;
    // this proves the check doesn't ALSO reject a legitimately in-bounds one.
    const clonePath = await mkdtemp(join(tmpdir(), 'dd-realpath-'));
    try {
      const targetPath = join(clonePath, 'real-file.txt');
      await writeFile(targetPath, 'hello', 'utf8');
      await symlink(targetPath, join(clonePath, 'in-bounds-link.txt'));

      const real = await resolveRealClonePath(clonePath, 'in-bounds-link.txt');
      expect(real).not.toBeNull();
      expect(real).toContain('real-file.txt');
    } finally {
      await rm(clonePath, { recursive: true, force: true });
    }
  });

  it('returns null for a broken symlink (target does not exist)', async () => {
    const clonePath = await mkdtemp(join(tmpdir(), 'dd-realpath-'));
    try {
      await symlink(join(clonePath, 'does-not-exist.txt'), join(clonePath, 'broken-link.txt'));
      const real = await resolveRealClonePath(clonePath, 'broken-link.txt');
      expect(real).toBeNull();
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

describe('buildSkillBody', () => {
  it('groups rows by category into separate sections', () => {
    const body = buildSkillBody([
      mkRow({ rule: 'Use async/await', category: 'error-handling' }),
      mkRow({ rule: 'Name services with a Service suffix', category: 'naming' }),
    ]);
    expect(body).toContain('## error-handling');
    expect(body).toContain('## naming');
    expect(body.indexOf('Use async/await')).toBeGreaterThan(body.indexOf('## error-handling'));
    expect(body.indexOf('Name services with a Service suffix')).toBeGreaterThan(
      body.indexOf('## naming'),
    );
  });

  it('keeps multiple rows of the same category under one section', () => {
    const body = buildSkillBody([
      mkRow({ rule: 'Rule A', category: 'naming' }),
      mkRow({ rule: 'Rule B', category: 'naming' }),
    ]);
    expect(body.match(/## naming/g)).toHaveLength(1);
    expect(body).toContain('- Rule A');
    expect(body).toContain('- Rule B');
  });

  it('falls back to an "other" section for a null category', () => {
    const body = buildSkillBody([mkRow({ rule: 'Uncategorized rule', category: null })]);
    expect(body).toContain('## other');
    expect(body).toContain('- Uncategorized rule');
  });

  it('appends evidence_path and :evidence_line when both are present', () => {
    const body = buildSkillBody([
      mkRow({ rule: 'Rule with evidence', evidencePath: 'src/foo.ts', evidenceLine: 42 }),
    ]);
    expect(body).toContain('- Rule with evidence (src/foo.ts:42)');
  });

  it('appends evidence_path without a line suffix when evidence_line is null', () => {
    const body = buildSkillBody([mkRow({ rule: 'Rule with path only', evidencePath: 'src/foo.ts' })]);
    expect(body).toContain('- Rule with path only (src/foo.ts)');
  });

  it('omits the evidence suffix entirely when evidence_path is null', () => {
    const body = buildSkillBody([mkRow({ rule: 'Rule with no evidence' })]);
    expect(body).toContain('- Rule with no evidence');
    expect(body).not.toMatch(/Rule with no evidence \(/);
  });

  it('produces just the heading for an empty array', () => {
    expect(buildSkillBody([])).toBe('# repo-conventions\n\n');
  });
});

describe('buildConventionsPrompt', () => {
  it('puts config files before source files, in that order', () => {
    const messages = buildConventionsPrompt(
      [{ path: 'src/foo.ts', content: 'export const foo = 1;' }],
      [{ path: 'tsconfig.json', content: '{"compilerOptions":{}}' }],
    );
    const user = messages[1]!.content;
    expect(user.indexOf('tsconfig.json')).toBeLessThan(user.indexOf('src/foo.ts'));
  });

  it('wraps every file section with wrapUntrusted (delimited by the file path as the source label)', () => {
    const messages = buildConventionsPrompt(
      [{ path: 'src/foo.ts', content: 'export const foo = 1;' }],
      [],
    );
    const user = messages[1]!.content;
    expect(user).toContain('<untrusted source="src/foo.ts">');
    expect(user).toContain('export const foo = 1;');
    expect(user).toContain('</untrusted>');
  });

  it('includes a system message instructing the model to cite concrete evidence', () => {
    const messages = buildConventionsPrompt([], []);
    expect(messages[0]!.role).toBe('system');
    expect(messages[0]!.content).toMatch(/evidence/i);
    expect(messages[1]!.role).toBe('user');
  });
});
