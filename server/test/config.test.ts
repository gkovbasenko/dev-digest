import { describe, it, expect, vi } from 'vitest';
import { loadConfig } from '../src/platform/config.js';

const BASE_ENV = { NODE_ENV: 'test' } as NodeJS.ProcessEnv;

/**
 * S2 — PROJECT_CONTEXT_ROOTS is gated through the closed ContextBadge enum
 * (`specs`/`docs`/`insights`) at load time, so an operator-configured name
 * outside that set can never silently reach `deriveBadge` (where it would
 * pass `roots.has(seg)` but then fail the badge parse, leaving discovery
 * return `{ indexed: true, documents: [] }` with no error).
 */
describe('loadConfig — projectContextRoots (S2)', () => {
  it('defaults to specs/docs/insights when unset', () => {
    const config = loadConfig({ ...BASE_ENV });
    expect(config.projectContextRoots).toEqual(['specs', 'docs', 'insights']);
  });

  it('accepts a valid custom subset', () => {
    const config = loadConfig({ ...BASE_ENV, PROJECT_CONTEXT_ROOTS: 'docs,insights' });
    expect(config.projectContextRoots).toEqual(['docs', 'insights']);
  });

  it('drops names outside the closed ContextBadge enum, keeping the valid ones, and warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const config = loadConfig({ ...BASE_ENV, PROJECT_CONTEXT_ROOTS: 'specs,adr,rfcs' });

    expect(config.projectContextRoots).toEqual(['specs']);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('adr');
    expect(warn.mock.calls[0]![0]).toContain('rfcs');

    warn.mockRestore();
  });

  it('falls back to the full default set when every configured name is unsupported', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const config = loadConfig({ ...BASE_ENV, PROJECT_CONTEXT_ROOTS: 'adr,rfcs' });

    expect(config.projectContextRoots).toEqual(['specs', 'docs', 'insights']);

    warn.mockRestore();
  });

  it('does not warn when every configured name is valid', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    loadConfig({ ...BASE_ENV, PROJECT_CONTEXT_ROOTS: 'specs,docs' });

    expect(warn).not.toHaveBeenCalled();

    warn.mockRestore();
  });
});
