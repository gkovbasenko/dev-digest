/* EvalsTab — Agent editor "Evals" tab (T6, AC-5/AC-6). Lists every eval case
   owned by the agent (status, expected/got, severity·category badge, run/edit/
   delete), the aggregate RECALL/PRECISION/CITATION ACCURACY/TRACES PASSED cards,
   and an "Eval cases X/Y passing" header — all sourced from the latest
   `eval_runs` row (T3). Renders under `s.tabBody` (own header/list layout, not
   `s.body` — client INSIGHTS 2026-07-01). Case CREATION is out of scope: there
   is no bare "create case" endpoint (cases originate from an accepted/dismissed
   finding via T5's "Turn into eval case" on PR-detail), so the empty state's
   "New eval case" action explains that and links to the Pull Requests list
   rather than opening the editor with a case that doesn't exist yet. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Button, EmptyState, IconBtn, SeverityBadge, CategoryTag } from "@devdigest/ui";
import type { EvalCase, EvalRunRecord } from "@devdigest/shared";
import {
  useAgentEvalCases,
  useAgentEvalRuns,
  useRunAgentEvals,
  useRunEvalCase,
  useDeleteEvalCase,
} from "@/lib/hooks/eval";
import { useActiveRepo } from "@/lib/repo-context";
import { EvalCaseEditor, StatusIcon, EvalMetricCard } from "@/components/eval";
import { caseResultText, deriveCaseBadge, deriveCaseStatus, latestRunOf } from "./helpers";
import { s } from "./styles";

export function EvalsTab({ agentId }: { agentId: string }) {
  const router = useRouter();
  const { repoId } = useActiveRepo();

  const { data: cases } = useAgentEvalCases(agentId);
  const { data: runs } = useAgentEvalRuns(agentId);
  const runAll = useRunAgentEvals();

  const [editingCase, setEditingCase] = React.useState<EvalCase | null>(null);

  const caseList = React.useMemo(() => cases ?? [], [cases]);
  const latestRun = React.useMemo(() => latestRunOf(runs), [runs]);
  const total = caseList.length;

  const headerLabel = latestRun
    ? `Eval cases ${latestRun.traces_passed}/${latestRun.traces_total} passing`
    : "Evals";

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <div style={s.titleRow}>
          <h2 style={s.h2}>{headerLabel}</h2>
          <Button
            kind="secondary"
            icon="Play"
            onClick={() => runAll.mutate(agentId)}
            disabled={runAll.isPending || total === 0}
          >
            {runAll.isPending ? "Running…" : "Run all"}
          </Button>
        </div>
        <div style={s.metrics}>
          <EvalMetricCard label="RECALL" value={latestRun?.recall ?? null} />
          <EvalMetricCard label="PRECISION" value={latestRun?.precision ?? null} />
          <EvalMetricCard label="CITATION ACCURACY" value={latestRun?.citation_accuracy ?? null} />
          <EvalMetricCard
            label="TRACES PASSED"
            value={latestRun ? `${latestRun.traces_passed}/${latestRun.traces_total}` : null}
            percent={false}
          />
        </div>
      </div>

      <div style={s.list}>
        {total === 0 ? (
          <EmptyState
            icon="FlaskConical"
            title="No eval cases yet"
            body={
              <>
                Eval cases are created from an accepted or dismissed finding on a pull request review —
                open a finding on PR-detail and choose “Turn into eval case.”
              </>
            }
            cta="New eval case"
            onCta={() => router.push(repoId ? `/repos/${repoId}/pulls` : "/")}
          />
        ) : (
          caseList.map((c) => (
            <CaseRow key={c.id} evalCase={c} runs={runs} onEdit={() => setEditingCase(c)} />
          ))
        )}
      </div>

      {editingCase && <EvalCaseEditor evalCase={editingCase} onClose={() => setEditingCase(null)} />}
    </div>
  );
}

function CaseRow({
  evalCase,
  runs,
  onEdit,
}: {
  evalCase: EvalCase;
  runs: EvalRunRecord[] | undefined;
  onEdit: () => void;
}) {
  const runCase = useRunEvalCase();
  const deleteCase = useDeleteEvalCase();

  const status = deriveCaseStatus(evalCase.id, runs);
  const resultText = caseResultText(evalCase.id, runs);
  const badge = deriveCaseBadge(evalCase.expected_output);

  const handleRun = () => {
    if (runCase.isPending) return;
    runCase.mutate(evalCase.id);
  };

  const handleDelete = () => {
    if (deleteCase.isPending) return;
    if (window.confirm(`Delete eval case "${evalCase.name}"? This cannot be undone.`)) {
      deleteCase.mutate(evalCase.id);
    }
  };

  // Clicking the row opens the editor; the action buttons stop propagation so
  // Run/Delete don't also trip the row's onClick.
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div
      style={s.row}
      role="button"
      tabIndex={0}
      onClick={onEdit}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onEdit();
        }
      }}
    >
      <StatusIcon status={status} />
      <div style={s.rowMain}>
        <span style={s.rowName}>{evalCase.name}</span>
        <span style={s.rowResult}>{resultText}</span>
      </div>
      <div style={s.rowBadge}>
        {badge ? (
          <>
            <SeverityBadge severity={badge.severity} compact />
            <CategoryTag category={badge.category} />
          </>
        ) : (
          <span style={s.emptyBadge}>[]</span>
        )}
      </div>
      <div style={s.rowActions} onClick={stop}>
        <IconBtn icon="Play" label={`Run ${evalCase.name}`} onClick={handleRun} />
        <IconBtn icon="Edit" label={`Edit ${evalCase.name}`} onClick={onEdit} />
        <IconBtn icon="Trash" label={`Delete ${evalCase.name}`} onClick={handleDelete} danger />
      </div>
    </div>
  );
}
