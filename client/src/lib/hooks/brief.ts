/* hooks/brief.ts — React Query hooks for the PR Why+Risk Brief.
     GET  /pulls/:id/brief → BriefRead (cached brief, zero LLM calls)
     POST /pulls/:id/brief → generates + persists (upsert) + returns BriefRead

   Mirrors the `useIntent`/`useRecomputeIntent` pattern (intent.ts). No local
   `onError` — mutation error toasts are wired globally (providers.tsx
   MutationCache). */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { BriefRead } from "../types";

/** GET /pulls/:id/brief → the cached Why+Risk brief for a PR (read-only, no
    LLM call). */
export function useBrief(prId: string | number | null | undefined) {
  return useQuery({
    queryKey: ["brief", prId],
    queryFn: () => api.get<BriefRead>(`/pulls/${prId}/brief`),
    enabled: prId != null,
  });
}

/** POST /pulls/:id/brief → (re)generates the Why+Risk brief and upserts it. */
export function useRegenerateBrief(prId: string | number | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<BriefRead>(`/pulls/${prId}/brief`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brief", prId] });
    },
  });
}
