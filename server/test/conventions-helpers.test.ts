import { describe, it, expect } from 'vitest';
import { sep } from 'node:path';
import { verifyEvidence, resolveClonePath } from '../src/modules/conventions/helpers.js';

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
