import { afterEach, describe, expect, it, vi } from 'vitest';
import { getConventionsTool } from '../src/tools/get-conventions.js';
import { CONVENTIONS_FIXTURE, REPOS_FIXTURE } from './fixtures.js';
import { get, mockFetch } from './mock-fetch.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

function parse(result: Awaited<ReturnType<typeof getConventionsTool.handler>>): any {
  return JSON.parse(result.content[0]!.text);
}

describe('get_conventions', () => {
  it('resolves repo then returns a compact conventions list', async () => {
    mockFetch([get('/repos', REPOS_FIXTURE), get('/repos/repo-1/conventions', CONVENTIONS_FIXTURE)]);

    const result = await getConventionsTool.handler({ repo: 'acme/widgets' });
    expect(result.isError).toBeUndefined();

    const body = parse(result);
    expect(body.conventions).toEqual([
      { rule: 'Use named exports, not default exports', category: 'imports', accepted: true },
      { rule: 'Prefer async/await over .then chains', category: 'other', accepted: false },
    ]);
  });

  it('error-forwards when the repo cannot be resolved', async () => {
    mockFetch([get('/repos', REPOS_FIXTURE)]);

    const result = await getConventionsTool.handler({ repo: 'acme/ghost' });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("'acme/ghost' not found");
  });
});
