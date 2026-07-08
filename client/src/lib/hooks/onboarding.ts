"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { OnboardingDoc } from "@devdigest/shared";

export function useOnboarding(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["onboarding", repoId],
    queryFn: () => api.get<OnboardingDoc>(`/repos/${repoId}/onboarding`),
    enabled: !!repoId,
  });
}

export function useRegenerateOnboarding(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<OnboardingDoc>(`/repos/${repoId}/onboarding/regenerate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["onboarding", repoId] }),
  });
}
