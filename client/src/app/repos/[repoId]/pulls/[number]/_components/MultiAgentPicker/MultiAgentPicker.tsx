/* MultiAgentPicker — PR-page trigger for a multi-agent fan-out (AC-1/AC-2).
   A checkbox per ENABLED agent + a single "Run multi-agent review (N)" action
   that fires exactly one `useMultiAgentRun().mutate({ prId, agentIds })` — no
   fallback to the legacy `POST /pulls/:id/review` (that stays on
   `RunReviewDropdown`, mounted alongside this component for back-compat). */
"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Checkbox } from "@devdigest/ui";
import { useAgents } from "../../../../../../../lib/hooks/agents";
import { useMultiAgentRun } from "../../../../../../../lib/hooks/multi-agent";
import { s } from "./styles";

export function MultiAgentPicker({
  prId,
  size = "sm",
  onRunStart,
  onRunsStarted,
}: {
  prId: string;
  size?: "sm" | "md" | "lg";
  /** Fired the moment the fan-out is kicked off (before the request settles). */
  onRunStart?: () => void;
  /** Fired with the spawned run_ids once the trigger request resolves — feeds
      the existing onRunsStarted chain (parent subscribes to per-run SSE). */
  onRunsStarted?: (runIds: string[]) => void;
}) {
  const t = useTranslations("runs");
  const { data: agents } = useAgents();
  const run = useMultiAgentRun();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const rootRef = useRef<HTMLDivElement>(null);

  const enabledAgents = (agents ?? []).filter((a) => a.enabled);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = useCallback((agentId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) next.delete(agentId);
      else next.add(agentId);
      return next;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    if (selected.size === 0 || run.isPending) return;
    onRunStart?.();
    run.mutate(
      { prId, agentIds: Array.from(selected) },
      {
        onSuccess: (res) => {
          onRunsStarted?.(res.runs.map((r) => r.run_id));
          setSelected(new Set());
          setOpen(false);
        },
        // No local onError: the global MutationCache already surfaces an error
        // toast for every mutation failure (client INSIGHTS 2026-07-01).
      },
    );
  }, [selected, run, prId, onRunStart, onRunsStarted]);

  return (
    <div ref={rootRef} style={s.root}>
      <Button
        kind="secondary"
        size={size}
        icon="Users"
        iconRight="ChevronDown"
        onClick={() => setOpen((o) => !o)}
      >
        {t("picker.trigger")}
      </Button>
      {open && (
        <div style={s.panel}>
          {enabledAgents.length ? (
            <div style={s.list}>
              {enabledAgents.map((a) => (
                <div key={a.id} style={s.row}>
                  <Checkbox checked={selected.has(a.id)} onChange={() => toggle(a.id)} label={a.name} />
                </div>
              ))}
            </div>
          ) : (
            <div style={s.empty}>{t("picker.noEnabledAgents")}</div>
          )}
          <div style={s.footer}>
            <Button
              kind="primary"
              size={size}
              full
              disabled={selected.size === 0}
              loading={run.isPending}
              onClick={handleConfirm}
            >
              {t("picker.confirm", { count: selected.size })}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
