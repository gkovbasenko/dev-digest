/* StatusIcon — shared pass/fail/never-run indicator for eval cases (T6/T7 consume
   this). Icon + a VISIBLE text label always — never color alone (WCAG AA), matching
   the SeverityBadge convention elsewhere in the app. */
import React from "react";
import { Icon } from "@devdigest/ui";

export type EvalCaseStatus = "pass" | "fail" | "never_run";

const CONFIG: Record<EvalCaseStatus, { color: string; label: string }> = {
  pass: { color: "var(--ok)", label: "Pass" },
  fail: { color: "var(--crit)", label: "Fail" },
  never_run: { color: "var(--text-muted)", label: "Never run" },
};

export function StatusIcon({ status }: { status: EvalCaseStatus }) {
  const cfg = CONFIG[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        fontWeight: 600,
        color: cfg.color,
      }}
    >
      {status === "pass" && <Icon.CheckCircle size={14} />}
      {status === "fail" && <Icon.XCircle size={14} />}
      {status === "never_run" && (
        <span
          aria-hidden="true"
          style={{
            display: "inline-block",
            width: 12,
            height: 12,
            borderRadius: "50%",
            border: "1.5px solid currentColor",
          }}
        />
      )}
      <span>{cfg.label}</span>
    </span>
  );
}
