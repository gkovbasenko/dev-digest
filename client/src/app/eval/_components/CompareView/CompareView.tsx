/* CompareView — side-by-side comparison of exactly two persisted eval runs
   (AC-18). Computed entirely client-side from the two already-loaded
   `EvalRunRecord`s passed in as props; no `/eval/compare` endpoint and no
   re-run POST happens here. */
import React from "react";
import { Icon } from "@devdigest/ui";
import type { EvalRunRecord } from "@devdigest/shared";
import { formatEvalPercent } from "@/components/eval";
import { formatCost, formatDate, formatPassRatio, formatSignedDelta } from "../format";
import { computeCompare } from "./helpers";
import { s } from "./styles";

export function CompareView({
  a,
  b,
  agentName,
  onClose,
}: {
  a: EvalRunRecord;
  b: EvalRunRecord;
  agentName?: string;
  onClose: () => void;
}) {
  const compare = computeCompare(a, b);
  const { delta } = compare;

  return (
    <div style={s.wrap}>
      <div style={s.backRow}>
        <button type="button" style={s.back} onClick={onClose}>
          <Icon.ChevronLeft size={14} />
          Back to recent runs
        </button>
      </div>

      <h1 style={s.h1}>{agentName ? `Compare runs · ${agentName}` : "Compare runs"}</h1>

      <div style={s.table}>
        <span style={s.headCell} />
        <span style={s.headCell}>{`v${a.owner_version} · ${formatDate(a.ran_at)}`}</span>
        <span style={s.headCell}>{`v${b.owner_version} · ${formatDate(b.ran_at)}`}</span>
        <span style={s.headCell}>Δ (B − A)</span>

        <span style={s.labelCell}>Recall</span>
        <span style={s.valueCell}>{formatEvalPercent(a.recall)}</span>
        <span style={s.valueCell}>{formatEvalPercent(b.recall)}</span>
        <span style={s.deltaCell(delta.recall == null ? null : delta.recall >= 0)}>
          {formatSignedDelta(delta.recall)}
        </span>

        <span style={s.labelCell}>Precision</span>
        <span style={s.valueCell}>{formatEvalPercent(a.precision)}</span>
        <span style={s.valueCell}>{formatEvalPercent(b.precision)}</span>
        <span style={s.deltaCell(delta.precision == null ? null : delta.precision >= 0)}>
          {formatSignedDelta(delta.precision)}
        </span>

        <span style={s.labelCell}>Citation accuracy</span>
        <span style={s.valueCell}>{formatEvalPercent(a.citation_accuracy)}</span>
        <span style={s.valueCell}>{formatEvalPercent(b.citation_accuracy)}</span>
        <span style={s.deltaCell(delta.citation_accuracy == null ? null : delta.citation_accuracy >= 0)}>
          {formatSignedDelta(delta.citation_accuracy)}
        </span>

        <span style={s.labelCell}>Pass count</span>
        <span style={s.valueCell}>{formatPassRatio(a.traces_passed, a.traces_total)}</span>
        <span style={s.valueCell}>{formatPassRatio(b.traces_passed, b.traces_total)}</span>
        <span style={s.deltaCell(delta.pass_count >= 0)}>
          {delta.pass_count > 0 ? `+${delta.pass_count}` : delta.pass_count}
        </span>

        <span style={s.labelCell}>Cost</span>
        <span style={s.valueCell}>{formatCost(a.cost_usd)}</span>
        <span style={s.valueCell}>{formatCost(b.cost_usd)}</span>
        <span style={s.deltaCell(null)}>—</span>
      </div>
    </div>
  );
}
