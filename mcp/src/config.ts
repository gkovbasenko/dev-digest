/**
 * Env-driven config for the MCP server. Every value has a sane default so the
 * server works out of the box against a locally-running `@devdigest/api`.
 */

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export interface Config {
  /** Base URL of the `@devdigest/api` Fastify server. No trailing slash. */
  apiUrl: string;
  /** Max time (ms) `run_review` polls for a triggered run before a graceful timeout. */
  waitTimeoutMs: number;
  /** Per-HTTP-call timeout (ms) against the API. */
  httpTimeoutMs: number;
}

export function loadConfig(): Config {
  const apiUrl = (process.env.DEVDIGEST_API_URL || 'http://localhost:3001').replace(/\/+$/, '');
  return {
    apiUrl,
    waitTimeoutMs: envInt('WAIT_TIMEOUT_MS', 120_000),
    httpTimeoutMs: envInt('HTTP_TIMEOUT_MS', 15_000),
  };
}

export const config = loadConfig();
