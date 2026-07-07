/* hooks/blast.ts — React Query hooks for the Blast Radius tab.
     GET /pulls/:id/blast → PrBlastResponse (changed symbols, per-symbol
   callers, impacted endpoints/crons, index status/degraded flag). Free,
   deterministic read over the repo-intel index — no LLM. Mirrors the
   `useIntent`/`useSmartDiff` query pattern (hooks/intent.ts, hooks/smart-diff.ts).
     GET /pulls/:id/prior-prs → PrHistory (other merged PRs touching the same
   files) — same free/deterministic shape, backs the "Prior PRs touching these
   files" accordion inside BlastTab. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { PrBlastResponse, PrHistory } from "../types";

/** GET /pulls/:id/blast → the blast radius impact map for a PR. */
export function useBlast(prId: string | number | null | undefined) {
  return useQuery({
    queryKey: ["blast", prId],
    queryFn: () => api.get<PrBlastResponse>(`/pulls/${prId}/blast`),
    enabled: prId != null,
  });
}

/** GET /pulls/:id/prior-prs → other merged PRs touching this PR's changed files. */
export function usePriorPrs(prId: string | number | null | undefined) {
  return useQuery({
    queryKey: ["prior-prs", prId],
    queryFn: () => api.get<PrHistory>(`/pulls/${prId}/prior-prs`),
    enabled: prId != null,
  });
}
