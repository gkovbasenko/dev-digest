/**
 * Test-only `fetch` mocking helper. `api-client.ts` calls the global `fetch`
 * directly (no injectable client), so tests stub `globalThis.fetch` with a
 * small router: an ordered list of handlers, each given the parsed request
 * URL + `RequestInit`, returning a `Response` for the first match or
 * `undefined` to fall through to the next handler.
 */
import { vi } from 'vitest';

export type RouteHandler = (
  url: URL,
  init: RequestInit | undefined,
) => Response | undefined;

/** Stub `globalThis.fetch` with an ordered router. Remember to
 * `vi.unstubAllGlobals()` in an `afterEach`. */
export function mockFetch(handlers: RouteHandler[]): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async (input: string | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    for (const handler of handlers) {
      const res = handler(url, init);
      if (res) return res;
    }
    throw new Error(`mockFetch: no handler matched ${init?.method ?? 'GET'} ${url.pathname}`);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

/** Build a JSON `Response` the way the real API would (status + body). */
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** A GET-only route matcher for a literal pathname. */
export function get(pathname: string, body: unknown, status = 200): RouteHandler {
  return (url, init) =>
    url.pathname === pathname && (init?.method ?? 'GET') === 'GET' ? json(body, status) : undefined;
}

/** A POST-only route matcher for a literal pathname. */
export function post(pathname: string, body: unknown, status = 200): RouteHandler {
  return (url, init) => (url.pathname === pathname && init?.method === 'POST' ? json(body, status) : undefined);
}
