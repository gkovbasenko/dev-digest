import { PrBlastResponse } from '@devdigest/shared';
import type { BlastResult, DegradedReason, IndexState } from '../../repo-intel/types.js';

/**
 * Human-readable text for each `DegradedReason` code the facade can surface.
 * Kept intentionally simple (T2 is a pure read/map layer, no LLM); falls back
 * to the raw code for anything not enumerated here so a future reason value
 * never silently disappears.
 */
const REASON_MESSAGES: Record<DegradedReason, string> = {
  flag_off: 'Repo intelligence indexing is disabled for this workspace.',
  index_failed: 'The last indexing attempt for this repo failed.',
  index_partial: 'This repo is only partially indexed.',
  repo_too_large: 'This repo is too large for a full index.',
  no_data: 'No index data is available for this repo yet.',
};

function reasonMessage(reason: DegradedReason | undefined): string | null {
  if (!reason) return null;
  return REASON_MESSAGES[reason] ?? reason;
}

/**
 * Pure mapper: facade `BlastResult` + `IndexState` → the `PrBlastResponse`
 * contract. No I/O — everything here is already-fetched data.
 *
 * Groups the facade's flat `callers` by the changed symbol they reach
 * (`viaSymbol`), one `downstream[]` entry per DISTINCT changed-symbol name
 * (in `changedSymbols` order; a symbol with zero callers still gets an entry
 * with an empty caller list). `endpoints_affected`/`crons_affected` per group
 * are the union of `factsByFile[callerFile]` across that group's caller
 * files — `factsByFile` is absent on the degraded/ripgrep path, in which case
 * both come back empty. `impacted_endpoints`/`impacted_crons` are the flat
 * deduped union across all groups.
 */
export function toPrBlastResponse(blast: BlastResult, state: IndexState): PrBlastResponse {
  const changed_symbols = blast.changedSymbols.map((s) => ({
    name: s.name,
    file: s.file,
    kind: s.kind,
  }));

  // Distinct symbol names, in first-seen order (matches changedSymbols order).
  const symbolNames: string[] = [];
  const seenNames = new Set<string>();
  for (const s of blast.changedSymbols) {
    if (seenNames.has(s.name)) continue;
    seenNames.add(s.name);
    symbolNames.push(s.name);
  }

  const callersBySymbol = new Map<string, typeof blast.callers>();
  for (const caller of blast.callers) {
    const group = callersBySymbol.get(caller.viaSymbol);
    if (group) group.push(caller);
    else callersBySymbol.set(caller.viaSymbol, [caller]);
  }

  const allEndpoints = new Set<string>();
  const allCrons = new Set<string>();

  const downstream = symbolNames.map((symbol) => {
    const callers = callersBySymbol.get(symbol) ?? [];

    const callerFiles = new Set(callers.map((c) => c.file));
    const endpoints = new Set<string>();
    const crons = new Set<string>();
    for (const file of callerFiles) {
      const facts = blast.factsByFile?.[file];
      if (!facts) continue;
      for (const e of facts.endpoints) endpoints.add(e);
      for (const c of facts.crons) crons.add(c);
    }
    for (const e of endpoints) allEndpoints.add(e);
    for (const c of crons) allCrons.add(c);

    return {
      symbol,
      callers: callers.map((c) => ({ name: c.symbol, file: c.file, line: c.line })),
      endpoints_affected: [...endpoints],
      crons_affected: [...crons],
    };
  });

  return PrBlastResponse.parse({
    changed_symbols,
    downstream,
    summary: '',
    impacted_endpoints: [...allEndpoints],
    impacted_crons: [...allCrons],
    index_status: state.status,
    // Degraded if the facade says so OR the index itself isn't full — a
    // partial/failed index means the map may be incomplete even when the
    // facade's own flag is an explicit `false` (`??` alone would let that
    // `false` mask a partial index, since `??` only falls back on null/undef).
    degraded: (blast.degraded ?? false) || state.status !== 'full',
    reason: reasonMessage(blast.reason ?? state.degradedReason),
  });
}
