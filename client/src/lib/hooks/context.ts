"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { ContextDocList, ContextDocPreview } from "@devdigest/shared";

/**
 * Project Context folder — discovery/preview (read-only) + agent/skill
 * attachment (paths only, ordered). Mirrors the `useAgentSkills`/
 * `useSetAgentSkills` shape (`lib/hooks/skills.ts`): a query keyed by the
 * owning id, a mutation that writes the server's response straight into that
 * query's cache via `setQueryData` (no extra round trip / invalidate).
 *
 * Supersedes the stale `useContextFiles`/`useReindexContext` (embedding-
 * flavored, `.devdigest/specs/`-rooted scaffolding that predates this spec —
 * removed from `lib/hooks/core.ts`).
 */

/** An attached doc's persisted path + position (paths only — never text). */
export interface ContextDocLink {
  path: string;
  order: number;
}

// ---- Discovery + preview (read-only) --------------------------------------

export function useContextDocs(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["context-docs", repoId],
    queryFn: () => api.get<ContextDocList>(`/repos/${repoId}/context`),
    enabled: !!repoId,
  });
}

export function useContextFilePreview(
  repoId: string | null | undefined,
  path: string | null | undefined
) {
  return useQuery({
    queryKey: ["context-file", repoId, path],
    queryFn: () =>
      api.get<ContextDocPreview>(
        `/repos/${repoId}/context/file?path=${encodeURIComponent(path!)}`
      ),
    enabled: !!repoId && !!path,
  });
}

// ---- Agent attachment ------------------------------------------------------

export function useAgentContext(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-context", agentId],
    queryFn: () => api.get<ContextDocLink[]>(`/agents/${agentId}/context`),
    enabled: !!agentId,
  });
}

/**
 * `repoId` names the repo the submitted paths were discovered from — required
 * by the API whenever `paths` is non-empty (agents aren't repo-scoped, so
 * that's the only way the server knows which clone to read + cap-check
 * against). Detaching everything (`paths: []`) never needs one.
 */
export function useSetAgentContext(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ paths, repoId }: { paths: string[]; repoId?: string }) =>
      api.post<ContextDocLink[]>(
        `/agents/${agentId}/context${repoId ? `?repo_id=${repoId}` : ""}`,
        { paths }
      ),
    onSuccess: (data) => {
      qc.setQueryData(["agent-context", agentId], data);
    },
  });
}

// ---- Skill attachment -------------------------------------------------------

export function useSkillContext(skillId: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-context", skillId],
    queryFn: () => api.get<ContextDocLink[]>(`/skills/${skillId}/context`),
    enabled: !!skillId,
  });
}

export function useSetSkillContext(skillId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ paths, repoId }: { paths: string[]; repoId?: string }) =>
      api.post<ContextDocLink[]>(
        `/skills/${skillId}/context${repoId ? `?repo_id=${repoId}` : ""}`,
        { paths }
      ),
    onSuccess: (data) => {
      qc.setQueryData(["skill-context", skillId], data);
    },
  });
}
