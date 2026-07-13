/* hooks/eval.ts — React Query hooks for the L06 Eval Pipeline (agent eval cases,
   single-case/batch runs, and the Eval Dashboard). Mirrors the agents.ts pattern:
   one hook per T3 `modules/eval/` endpoint, api.* as the sole fetch boundary. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { EvalCase, EvalRunRecord, EvalRunResult, EvalDashboard } from "@devdigest/shared";

/** Every eval query key shares the "eval-cases" / "eval-runs" / "eval-dashboard"
    prefix so a single `invalidateQueries({ queryKey: [prefix] })` (default
    non-exact match) refreshes every variant (per-agent, dashboard-wide, etc.)
    without the caller having to track which agentId a mutation affects. */
const EVAL_CASES_KEY = "eval-cases";
const EVAL_RUNS_KEY = "eval-runs";
const EVAL_DASHBOARD_KEY = "eval-dashboard";

function invalidateEvalQueries(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: [EVAL_CASES_KEY] });
  qc.invalidateQueries({ queryKey: [EVAL_RUNS_KEY] });
  qc.invalidateQueries({ queryKey: [EVAL_DASHBOARD_KEY] });
}

/** `GET /agents/:id/eval-cases` — every eval case owned by the agent. */
export function useAgentEvalCases(agentId: string | null | undefined) {
  return useQuery({
    queryKey: [EVAL_CASES_KEY, agentId],
    queryFn: () => api.get<EvalCase[]>(`/agents/${agentId}/eval-cases`),
    enabled: !!agentId,
  });
}

/** `POST /findings/:findingId/eval-case` — create (or, if one already exists for
    this finding, return the de-duped) eval case pre-filled from an accepted/
    dismissed finding. */
export function useCreateEvalCaseFromFinding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (findingId: string) => api.post<EvalCase>(`/findings/${findingId}/eval-case`),
    onSuccess: () => invalidateEvalQueries(qc),
  });
}

export interface UpdateEvalCaseInput {
  id: string;
  patch: Partial<
    Pick<EvalCase, "name" | "input_diff" | "input_files" | "input_meta" | "expected_output" | "notes">
  >;
}

export type CreateEvalCaseInput = { name: string } & Partial<
  Pick<EvalCase, "input_diff" | "input_files" | "input_meta" | "expected_output" | "notes">
>;

/** `POST /agents/:id/eval-cases` — author a new eval case from scratch (owner is
    the agent; the frozen input diff + expected output are supplied by hand). */
export function useCreateEvalCase(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEvalCaseInput) =>
      api.post<EvalCase>(`/agents/${agentId}/eval-cases`, input),
    onSuccess: () => invalidateEvalQueries(qc),
  });
}

/** `PUT /eval-cases/:id` — update an eval case (name / expected_output / notes / frozen input). */
export function useUpdateEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateEvalCaseInput) => api.put<EvalCase>(`/eval-cases/${id}`, patch),
    onSuccess: () => invalidateEvalQueries(qc),
  });
}

/** `DELETE /eval-cases/:id`. */
export function useDeleteEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/eval-cases/${id}`),
    onSuccess: () => invalidateEvalQueries(qc),
  });
}

/** `POST /eval-cases/:id/run` — run a single case against the owner's current
    config (AC-21). Returns the same `EvalRunResult` shape as a batch run. */
export function useRunEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<EvalRunResult>(`/eval-cases/${id}/run`),
    onSuccess: () => invalidateEvalQueries(qc),
  });
}

/** `POST /agents/:id/eval-runs` — run the agent's whole eval set (batch). */
export function useRunAgentEvals() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (agentId: string) => api.post<EvalRunResult>(`/agents/${agentId}/eval-runs`),
    onSuccess: () => invalidateEvalQueries(qc),
  });
}

/** `GET /eval/dashboard` (optionally `?agentId=` for the agent-detail view). */
export function useEvalDashboard(agentId?: string | null) {
  return useQuery({
    queryKey: [EVAL_DASHBOARD_KEY, agentId ?? null],
    queryFn: () =>
      api.get<EvalDashboard>(agentId ? `/eval/dashboard?agentId=${agentId}` : "/eval/dashboard"),
  });
}

/** `GET /agents/:id/eval-runs` — run history for an agent (trend/compare source). */
export function useAgentEvalRuns(agentId: string | null | undefined) {
  return useQuery({
    queryKey: [EVAL_RUNS_KEY, agentId],
    queryFn: () => api.get<EvalRunRecord[]>(`/agents/${agentId}/eval-runs`),
    enabled: !!agentId,
  });
}
