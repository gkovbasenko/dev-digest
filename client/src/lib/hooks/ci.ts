/* hooks/ci.ts — React Query hooks for Export to CI (agent → devdigest/ci PR,
   installations, and ingested CI runs). Mirrors the eval.ts pattern: one hook
   per `ci/` route, `api.*` as the sole fetch boundary, a shared query-key
   prefix + one `invalidateCiQueries()` helper. `ci_fail_on` is NOT a new
   mutation here — it reuses `useUpdateAgent` (already carries it in
   `UpdateAgentInput.patch`), per the plan's explicit "do not add a new
   mutation for it." */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { CiExport, CiExportInputBody, CiInstallation, CiRun } from "@devdigest/shared";

/** Every CI query key shares one of these two prefixes so a single
    `invalidateQueries({ queryKey: [prefix] })` (default non-exact match)
    refreshes every variant (per-agent, workspace-wide) at once. */
const CI_INSTALLATIONS_KEY = "ci-installations";
const CI_RUNS_KEY = "ci-runs";

function invalidateCiQueries(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: [CI_INSTALLATIONS_KEY] });
  qc.invalidateQueries({ queryKey: [CI_RUNS_KEY] });
}

export type ExportCiInput = CiExportInputBody & { agentId: string };

/** `POST /agents/:id/export-ci` — build/commit the CI bundle (Export Wizard's
    Preview call uses `action:'files'`; the Install step's confirm uses
    `action:'open_pr'` or `'files'`, per the wizard's accumulated state). */
export function useExportCi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, ...body }: ExportCiInput) =>
      api.post<CiExport>(`/agents/${agentId}/export-ci`, body),
    onSuccess: () => invalidateCiQueries(qc),
  });
}

/** `GET /agents/:id/ci-installations` — every repo this agent is installed in. */
export function useCiInstallations(agentId: string | null | undefined) {
  return useQuery({
    queryKey: [CI_INSTALLATIONS_KEY, agentId],
    queryFn: () => api.get<CiInstallation[]>(`/agents/${agentId}/ci-installations`),
    enabled: !!agentId,
  });
}

/** `GET /ci-runs` (workspace-wide, CI Runs page) or `GET /agents/:id/ci-runs`
    (agent CI tab's run history) depending on whether an `agentId` is given. */
export function useCiRuns(agentId?: string | null) {
  return useQuery({
    queryKey: [CI_RUNS_KEY, agentId ?? null],
    queryFn: () => api.get<CiRun[]>(agentId ? `/agents/${agentId}/ci-runs` : "/ci-runs"),
  });
}

/** `POST /ci-runs/refresh` — pull-ingest `devdigest-review` workflow runs for
    every installation into `ci_runs`. */
export function useRefreshCiRuns() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ ok: boolean }>("/ci-runs/refresh"),
    onSuccess: () => invalidateCiQueries(qc),
  });
}
