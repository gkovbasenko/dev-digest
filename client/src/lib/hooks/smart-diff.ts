/* hooks/smart-diff.ts — React Query hook for the deterministic Smart Diff
     GET /pulls/:id/smart-diff → SmartDiffResponse (Core/Wiring/Boilerplate
   groups + split suggestion). No LLM call here — the server composes this from
   already-fetched PR files + already-computed findings. Mirrors the
   `useIntent` query pattern (hooks/intent.ts). */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { SmartDiffResponse } from "../types";

/** GET /pulls/:id/smart-diff → the Smart Diff layout for a PR. */
export function useSmartDiff(prId: string | number | null | undefined) {
  return useQuery({
    queryKey: ["smart-diff", prId],
    queryFn: () => api.get<SmartDiffResponse>(`/pulls/${prId}/smart-diff`),
    enabled: prId != null,
  });
}
