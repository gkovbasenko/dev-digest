import { describe, it, expect } from 'vitest';
import { deriveBadge, isAllowedContextPath } from '../src/modules/_shared/context-badge.js';

const ROOTS = new Set(['specs', 'docs', 'insights']);

describe('deriveBadge', () => {
  it('badges a doc directly under a root folder', () => {
    expect(deriveBadge('specs/a.md', ROOTS)).toBe('specs');
    expect(deriveBadge('docs/b.md', ROOTS)).toBe('docs');
  });

  it('badges by the NEAREST enclosing root folder, not an outer ancestor', () => {
    expect(deriveBadge('deep/nested/insights/c.md', ROOTS)).toBe('insights');
  });

  it('returns null when no ancestor folder matches a configured root', () => {
    expect(deriveBadge('src/x.md', ROOTS)).toBeNull();
  });

  it('returns null for a root name outside the closed ContextBadge enum, even if configured', () => {
    // roots.has('adr') would pass, but 'adr' doesn't parse as ContextBadge —
    // this is the exact S2 mismatch the config-level fix now prevents from
    // ever reaching here as a "configured" root in the first place.
    const withUnsupported = new Set(['specs', 'adr']);
    expect(deriveBadge('adr/rfc-1.md', withUnsupported)).toBeNull();
  });
});

/**
 * S5 — the preview and attach-validate paths must reject anything the
 * discovery contract (.md under a configured root) would never have listed,
 * even though a realpath containment check alone would allow reading it.
 */
describe('isAllowedContextPath (S5)', () => {
  it('allows a .md file under a configured root', () => {
    expect(isAllowedContextPath('specs/a.md', ROOTS)).toBe(true);
  });

  it('rejects a non-.md file under a configured root (e.g. secrets, source)', () => {
    expect(isAllowedContextPath('specs/.env', ROOTS)).toBe(false);
    expect(isAllowedContextPath('.env', ROOTS)).toBe(false);
  });

  it('rejects a .md file not under any configured root', () => {
    expect(isAllowedContextPath('evil-link.md', ROOTS)).toBe(false);
    expect(isAllowedContextPath('README.md', ROOTS)).toBe(false);
  });

  it('matches walkClone discovery\'s case-insensitive extension check (.MD is allowed, same as .md)', () => {
    expect(isAllowedContextPath('specs/a.MD', ROOTS)).toBe(true);
  });
});
