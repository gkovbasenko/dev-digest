/**
 * `get_blast_radius` — blast radius (symbols and callers impacted by a pull
 * request's changes), read live from `GET /pulls/:id/blast`
 * (`server/src/modules/reviews/routes.ts`). Deterministic read over the
 * repo-intel index — no LLM, no persistence, free.
 *
 * `downstream[]`/per-symbol `callers[]` can be large for a PR touching a
 * widely-called symbol, so both are capped here (see `capBlast`) — the same
 * unbounded-response-size discipline the `get_findings` TODO calls for
 * (`mcp/README.md`, commit e1950b8), applied for real since this tool didn't
 * exist as a live call yet.
 */
import { z } from 'zod';
import { apiClient } from '../api-client.js';
import { resolvePr, resolveRepo } from '../resolve.js';
import { errorResult, textResult } from './tool.js';
import type { ToolDef } from './tool.js';

const InputSchema = {
  repo: z.string().min(1).describe("Repo in 'owner/name' form"),
  pr: z.number().int().describe('Pull request number'),
};

/** Raw shape read off `GET /pulls/:id/blast` (`PrBlastResponse` —
 * `server/src/vendor/shared/contracts/brief.ts`). Only the fields this tool
 * actually reads/passes through. */
interface ChangedSymbolRaw {
  name: string;
  file: string;
  kind: string;
}

interface BlastCallerRaw {
  name: string;
  file: string;
  line: number;
}

interface DownstreamImpactRaw {
  symbol: string;
  callers: BlastCallerRaw[];
  endpoints_affected: string[];
  crons_affected: string[];
}

interface PrBlastResponseRaw {
  changed_symbols: ChangedSymbolRaw[];
  downstream: DownstreamImpactRaw[];
  summary: string;
  impacted_endpoints: string[];
  impacted_crons: string[];
  index_status: 'full' | 'partial' | 'degraded' | 'failed';
  degraded: boolean;
  reason?: string | null;
}

// Response-size cap: a PR touching a widely-called symbol can produce a huge
// `downstream[]`/`callers[]` payload. Cap both, most-callers-first, and
// signal truncation via `*_total`/`*_truncated` rather than silently
// dropping data.
const MAX_DOWNSTREAM_SYMBOLS = 20;
const MAX_CALLERS_PER_SYMBOL = 10;

interface DownstreamImpactCapped {
  symbol: string;
  callers: BlastCallerRaw[];
  callers_total: number;
  callers_truncated: boolean;
  endpoints_affected: string[];
  crons_affected: string[];
}

function capBlast(data: PrBlastResponseRaw): {
  changed_symbols: ChangedSymbolRaw[];
  downstream: DownstreamImpactCapped[];
  downstream_total: number;
  downstream_truncated: boolean;
  impacted_endpoints: string[];
  impacted_crons: string[];
  summary: string;
  index_status: PrBlastResponseRaw['index_status'];
  degraded: boolean;
  reason: string | null;
} {
  const downstreamTotal = data.downstream.length;
  // Most-impactful-first: symbols with more callers are more likely to be
  // what a reviewer cares about, so they survive the cap.
  const sortedDownstream = [...data.downstream].sort((a, b) => b.callers.length - a.callers.length);

  const cappedDownstream: DownstreamImpactCapped[] = sortedDownstream
    .slice(0, MAX_DOWNSTREAM_SYMBOLS)
    .map((d) => {
      const callersTotal = d.callers.length;
      return {
        symbol: d.symbol,
        callers: d.callers.slice(0, MAX_CALLERS_PER_SYMBOL),
        callers_total: callersTotal,
        callers_truncated: callersTotal > MAX_CALLERS_PER_SYMBOL,
        endpoints_affected: d.endpoints_affected,
        crons_affected: d.crons_affected,
      };
    });

  return {
    changed_symbols: data.changed_symbols,
    downstream: cappedDownstream,
    downstream_total: downstreamTotal,
    downstream_truncated: downstreamTotal > MAX_DOWNSTREAM_SYMBOLS,
    impacted_endpoints: data.impacted_endpoints,
    impacted_crons: data.impacted_crons,
    summary: data.summary,
    index_status: data.index_status,
    degraded: data.degraded,
    reason: data.reason ?? null,
  };
}

export const getBlastRadiusTool: ToolDef<typeof InputSchema> = {
  name: 'dev_digest_get_blast_radius',
  description:
    "Get the blast radius (changed symbols, their callers, and impacted endpoints/crons) for " +
    'a pull request, read from the repo-intel index. Read-only, no LLM; the index may be ' +
    'partial/degraded for a repo that has not been fully indexed yet.',
  inputSchema: InputSchema,
  annotations: { title: 'Get blast radius', readOnlyHint: true },
  handler: async ({ repo, pr }) => {
    const repoResolved = await resolveRepo(repo);
    if (!repoResolved.ok) return errorResult(repoResolved.error);

    const prResolved = await resolvePr(repoResolved.id, pr);
    if (!prResolved.ok) return errorResult(prResolved.error);

    const res = await apiClient.get<PrBlastResponseRaw>(`/pulls/${prResolved.id}/blast`);
    if (!res.ok) return errorResult(res.error);

    return textResult(capBlast(res.data));
  },
};
