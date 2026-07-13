/* CompareView — modal comparison of exactly two persisted eval runs. Metric
   deltas are computed client-side from the two already-loaded `EvalRunRecord`s
   (no `/eval/compare` endpoint, no re-run). The System Prompt Diff and the
   Promote action read/reuse the existing agent-version endpoints:
     - prompt diff  ← GET  /agents/:id/versions/:version   (both versions)
     - Promote v{b} ← PUT  /agents/:id                     (restore B's config
                        as a new live version — reversible via version history) */
"use client";

import React from "react";
import { Modal, Button } from "@devdigest/ui";
import type { EvalRunRecord } from "@devdigest/shared";
import { useAgentVersion, useUpdateAgent } from "@/lib/hooks/agents";
import { formatEvalPercent } from "@/components/eval";
import { formatCost, formatPoints } from "../format";
import { computeCompare, diffLines } from "./helpers";
import { s } from "./styles";

/** One metric tile: `old → new` with a colored ▲/▼ point-delta. All three
    metrics here are higher-is-better, so a positive delta is always "good". */
function MetricTile({
  label,
  a,
  b,
  delta,
}: {
  label: string;
  a: number | null;
  b: number | null;
  delta: number | null;
}) {
  const dir = delta == null || delta === 0 ? 0 : delta > 0 ? 1 : -1;
  const color = dir === 0 ? "var(--text-muted)" : dir > 0 ? "var(--ok)" : "var(--crit)";
  return (
    <div style={s.tile}>
      <span style={s.tileLabel}>{label}</span>
      <div style={s.tileRow}>
        <span style={s.tileOld}>{formatEvalPercent(a)}</span>
        <span style={s.tileArrow}>→</span>
        <span style={s.tileNew}>{formatEvalPercent(b)}</span>
        <span style={s.delta(color)}>
          {dir !== 0 && <span aria-hidden>{dir > 0 ? "▲" : "▼"}</span>}
          {formatPoints(delta)}
        </span>
      </div>
    </div>
  );
}

/** Cost tile — direction is shown but kept neutral (cheaper/dearer isn't a
    pass/fail like the quality metrics). */
function CostTile({ a, b }: { a: number | null; b: number | null }) {
  const delta = a != null && b != null ? b - a : null;
  const dir = delta == null || delta === 0 ? 0 : delta > 0 ? 1 : -1;
  return (
    <div style={s.tile}>
      <span style={s.tileLabel}>Cost</span>
      <div style={s.tileRow}>
        <span style={s.tileOld}>{formatCost(a)}</span>
        <span style={s.tileArrow}>→</span>
        <span style={s.tileNew}>{formatCost(b)}</span>
        <span style={s.delta("var(--text-muted)")}>
          {dir !== 0 && <span aria-hidden>{dir > 0 ? "▲" : "▼"}</span>}
          {delta == null ? "—" : `${Math.abs(delta).toFixed(4)}`}
        </span>
      </div>
    </div>
  );
}

export function CompareView({
  a,
  b,
  onClose,
}: {
  a: EvalRunRecord;
  b: EvalRunRecord;
  onClose: () => void;
}) {
  const { delta } = computeCompare(a, b);
  const agentId = a.owner_id;

  const vOld = useAgentVersion(agentId, a.owner_version);
  const vNew = useAgentVersion(agentId, b.owner_version);
  const update = useUpdateAgent();

  const promote = () => {
    const cfg = vNew.data?.config;
    if (!cfg || update.isPending) return;
    update.mutate(
      {
        id: agentId,
        patch: {
          provider: cfg.provider,
          model: cfg.model,
          system_prompt: cfg.system_prompt,
          output_schema: cfg.output_schema,
          strategy: cfg.strategy,
          ci_fail_on: cfg.ci_fail_on,
          repo_intel: cfg.repo_intel,
        },
      },
      { onSuccess: onClose },
    );
  };

  const diff =
    vOld.data && vNew.data
      ? diffLines(vOld.data.config.system_prompt, vNew.data.config.system_prompt)
      : null;
  const diffFailed = vOld.isError || vNew.isError;

  return (
    <Modal
      width={880}
      title={`Compare runs · v${a.owner_version} → v${b.owner_version}`}
      subtitle="Old prompt vs new — metric deltas and prompt diff"
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="secondary" onClick={onClose}>
            Close
          </Button>
          <Button
            kind="primary"
            icon="GitBranch"
            loading={update.isPending}
            disabled={!vNew.data || update.isPending}
            onClick={promote}
          >
            {`Promote v${b.owner_version}`}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <div style={s.tiles}>
          <MetricTile label="Recall" a={a.recall} b={b.recall} delta={delta.recall} />
          <MetricTile label="Precision" a={a.precision} b={b.precision} delta={delta.precision} />
          <MetricTile
            label="Citation"
            a={a.citation_accuracy}
            b={b.citation_accuracy}
            delta={delta.citation_accuracy}
          />
          <CostTile a={a.cost_usd} b={b.cost_usd} />
        </div>

        <div style={s.diffSection}>
          <div style={s.diffHead}>
            <span style={s.diffTitle}>System prompt diff</span>
            <span style={s.legend}>
              <span style={s.legendItem}>
                <span style={s.legendChip("color-mix(in srgb, var(--crit) 45%, transparent)")} />
                {`v${a.owner_version} (old)`}
              </span>
              <span style={s.legendItem}>
                <span style={s.legendChip("color-mix(in srgb, var(--ok) 45%, transparent)")} />
                {`v${b.owner_version} (new)`}
              </span>
            </span>
          </div>

          {diff ? (
            <pre style={s.diffBox}>
              {diff.map((ln, idx) => (
                <span key={idx} style={s.diffLine(ln.type)}>
                  <span style={s.diffSign} aria-hidden>
                    {ln.type === "add" ? "+" : ln.type === "del" ? "−" : " "}
                  </span>
                  {ln.text || " "}
                </span>
              ))}
            </pre>
          ) : (
            <div style={s.diffEmpty}>
              {diffFailed ? "Prompt snapshot unavailable for one of these versions." : "Loading prompt…"}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
