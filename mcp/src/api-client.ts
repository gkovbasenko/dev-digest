/**
 * Thin `fetch` wrapper over the `@devdigest/api` HTTP layer. Every call:
 *  - prefixes `config.apiUrl` (base URL, no trailing slash — routes are
 *    registered flat, no prefix: `server/src/app.ts:168-169`),
 *  - applies `AbortSignal.timeout(config.httpTimeoutMs)`,
 *  - parses JSON,
 *  - maps failures (network / HTTP status) to an ACTIONABLE message.
 *
 * Never throws on the happy path OR the unhappy path — callers get a
 * structured `ApiResult<T>` and decide what to do (surface as a tool error,
 * retry, etc.). This keeps tool handlers free of try/catch boilerplate.
 */
import { config } from './config.js';

export interface ApiSuccess<T> {
  ok: true;
  status: number;
  data: T;
}

export interface ApiFailure {
  ok: false;
  status: number | null;
  error: string;
}

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

const MAX_ERROR_BODY_LEN = 200;

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function mapNetworkError(err: unknown, url: string): string {
  if (err instanceof Error) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return `dev-digest API timed out after ${config.httpTimeoutMs}ms calling ${url} — is the server overloaded or hung?`;
    }
    const cause = (err as Error & { cause?: unknown }).cause;
    const code =
      cause && typeof cause === 'object' && 'code' in cause
        ? (cause as { code?: unknown }).code
        : undefined;
    if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || /fetch failed/i.test(err.message)) {
      return (
        `dev-digest API не відповідає на ${config.apiUrl} — ` +
        'переконайтесь, що server запущено (`pnpm dev` у server/).'
      );
    }
  }
  return `dev-digest API: unexpected network error calling ${url}: ${String(err)}`;
}

async function mapHttpError(res: Response, url: string): Promise<string> {
  let bodyText = '';
  try {
    bodyText = await res.text();
  } catch {
    // best-effort only
  }
  const detail = bodyText ? ` — ${truncate(bodyText, MAX_ERROR_BODY_LEN)}` : '';

  if (res.status === 404) {
    return `dev-digest API: not found (404) at ${url}${detail}`;
  }
  if (res.status === 429) {
    return (
      `dev-digest API: rate-limited (429) at ${url} — review triggers are capped ` +
      `at 10/min; wait a moment and retry${detail}`
    );
  }
  if (res.status >= 500) {
    return `dev-digest API: server error (${res.status}) at ${url}${detail}`;
  }
  return `dev-digest API: request failed (${res.status}) at ${url}${detail}`;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
  const url = `${config.apiUrl}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(config.httpTimeoutMs),
    });
  } catch (err) {
    return { ok: false, status: null, error: mapNetworkError(err, url) };
  }

  if (!res.ok) {
    return { ok: false, status: res.status, error: await mapHttpError(res, url) };
  }

  try {
    const data = (await res.json()) as T;
    return { ok: true, status: res.status, data };
  } catch {
    return {
      ok: false,
      status: res.status,
      error: `dev-digest API returned invalid JSON from ${url}`,
    };
  }
}

export const apiClient = {
  get: <T>(path: string): Promise<ApiResult<T>> => request<T>('GET', path),
  post: <T>(path: string, body?: unknown): Promise<ApiResult<T>> => request<T>('POST', path, body),
};
