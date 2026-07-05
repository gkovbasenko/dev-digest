"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { ConventionCandidate, SkillType } from "@devdigest/shared";

export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["conventions", repoId],
    queryFn: () => api.get<ConventionCandidate[]>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

export function useExtractConventions(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ConventionCandidate[]>(`/repos/${repoId}/conventions/extract`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conventions", repoId] }),
  });
}

export interface ConventionActionInput {
  id: string;
  repoId: string;
  patch: {
    rule?: string;
    category?: string | null;
    accepted?: boolean;
    rejected?: boolean;
  };
}

export function useConventionAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: ConventionActionInput) =>
      api.patch<ConventionCandidate>(`/conventions/${id}`, patch),
    onSuccess: (_d, { repoId }) => {
      qc.invalidateQueries({ queryKey: ["conventions", repoId] });
    },
  });
}

export interface SkillBundle {
  name: string;
  description: string;
  type: SkillType;
  body: string;
}

export function useBundleConventions(repoId: string) {
  return useMutation({
    mutationFn: () => api.post<SkillBundle>(`/repos/${repoId}/conventions/bundle`),
  });
}
