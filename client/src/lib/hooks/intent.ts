/* hooks/intent.ts — React Query hooks for the derived PR Intent/Scope layer.
     GET  /pulls/:id/intent           → PrIntentRecord | null (stored intent, if any)
     POST /pulls/:id/intent/recompute → computes + persists (upsert) + returns the record

   Mirrors the `usePullDetail` query pattern (core.ts) and the
   `useResyncRepoIntel` mutation pattern (repo-intel.ts). No local `onError` —
   mutation error toasts are wired globally (providers.tsx MutationCache). */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { PrIntentRecord } from "../types";

/** GET /pulls/:id/intent → the stored intent/scope for a PR, or null before
    the first compute. */
export function useIntent(prId: string | number | null | undefined) {
  return useQuery({
    queryKey: ["intent", prId],
    queryFn: () => api.get<PrIntentRecord | null>(`/pulls/${prId}/intent`),
    enabled: prId != null,
  });
}

/** POST /pulls/:id/intent/recompute → (re)computes intent/scope and upserts it. */
export function useRecomputeIntent(prId: string | number | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrIntentRecord>(`/pulls/${prId}/intent/recompute`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intent", prId] });
    },
  });
}
