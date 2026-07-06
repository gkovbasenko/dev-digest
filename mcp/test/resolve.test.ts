/**
 * `resolve.ts` — not-found cases, and the agent-name ambiguity path
 * (exactly-1 -> use; >1 -> enabled-narrowing; still ambiguous -> actionable
 * error-forward naming `list_agents`, per plan decision #5).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { resolveAgent, resolvePr, resolveRepo } from '../src/resolve.js';
import { AGENTS_FIXTURE, PULLS_FIXTURE, REPOS_FIXTURE } from './fixtures.js';
import { get, mockFetch } from './mock-fetch.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveRepo', () => {
  it('resolves an existing owner/name to its id', async () => {
    mockFetch([get('/repos', REPOS_FIXTURE)]);
    const result = await resolveRepo('acme/widgets');
    expect(result).toEqual({ ok: true, id: 'repo-1' });
  });

  it('returns a not-found error for an unknown repo', async () => {
    mockFetch([get('/repos', REPOS_FIXTURE)]);
    const result = await resolveRepo('acme/does-not-exist');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("'acme/does-not-exist' not found");
    }
  });
});

describe('resolvePr', () => {
  it('resolves an existing PR number to its id', async () => {
    mockFetch([get('/repos/repo-1/pulls', PULLS_FIXTURE)]);
    const result = await resolvePr('repo-1', 42);
    expect(result).toEqual({ ok: true, id: 'pr-42' });
  });

  it('returns a not-found error for an unknown PR number', async () => {
    mockFetch([get('/repos/repo-1/pulls', PULLS_FIXTURE)]);
    const result = await resolvePr('repo-1', 999);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('PR #999 not found');
    }
  });

  it('returns a "not imported yet" error when PrMeta.id is nullish', async () => {
    mockFetch([get('/repos/repo-1/pulls', PULLS_FIXTURE)]);
    const result = await resolvePr('repo-1', 43);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('#43');
    }
  });
});

describe('resolveAgent', () => {
  it('resolves an unambiguous name (exactly 1 match)', async () => {
    mockFetch([get('/agents', AGENTS_FIXTURE)]);
    const result = await resolveAgent('security-reviewer');
    expect(result).toEqual({ ok: true, id: 'agent-1' });
  });

  it('resolves >1 matches by narrowing to the single enabled candidate', async () => {
    mockFetch([get('/agents', AGENTS_FIXTURE)]);
    const result = await resolveAgent('shared-name');
    expect(result).toEqual({ ok: true, id: 'agent-3' });
  });

  it('returns a candidate-listing error-forward when >1 matches remain enabled', async () => {
    mockFetch([get('/agents', AGENTS_FIXTURE)]);
    const result = await resolveAgent('ambiguous-name');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('ambiguous');
      expect(result.error).toContain('ambiguous-name');
      // Every branch names the next useful tool ("error leads forward").
      expect(result.error).toContain('list_agents');
      // Both candidates' provider/model/enabled state are listed.
      expect(result.error).toContain('anthropic');
      expect(result.error).toContain('openai');
    }
  });

  it('returns a not-found error naming list_agents for an unknown name', async () => {
    mockFetch([get('/agents', AGENTS_FIXTURE)]);
    const result = await resolveAgent('does-not-exist');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('list_agents');
    }
  });
});
