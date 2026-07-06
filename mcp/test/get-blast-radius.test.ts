/**
 * `get_blast_radius` — stub tool. Must return `{ status: 'not_implemented' }`
 * and must NEVER call the API (plan decision #4).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getBlastRadiusTool } from '../src/tools/get-blast-radius.js';
import { mockFetch } from './mock-fetch.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

function parse(result: Awaited<ReturnType<typeof getBlastRadiusTool.handler>>): any {
  return JSON.parse(result.content[0]!.text);
}

describe('get_blast_radius', () => {
  it('returns not_implemented without calling the API', async () => {
    const fetchMock = mockFetch([
      () => {
        throw new Error('get_blast_radius must not call the API');
      },
    ]);

    const result = await getBlastRadiusTool.handler({ repo: 'acme/widgets', pr: 42 });
    expect(result.isError).toBeUndefined();

    const body = parse(result);
    expect(body.status).toBe('not_implemented');
    expect(typeof body.hint).toBe('string');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
