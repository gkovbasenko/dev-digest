/* WhereAgentsDisagree — "Where agents disagree" (AC-28..30, AC-22). One row
   per contended `file:line`+title, one cell per agent that reviewed the PR:
   the agent's severity (if it flagged the location) or "did not flag" for a
   `verdict:'ignored'` take, plus its note. A failed agent never appears here
   at all — the server matcher (T3) drops non-`done` agents from `takes`
   entirely (AC-21/30), so this component only ever renders what it's given.

   Finding-derived text (`take.note`) is untrusted LLM output — always render
   it through the sanitized `Markdown` primitive, never raw HTML. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState, Markdown, SeverityBadge, Toggle } from "@devdigest/ui";
import type { Conflict } from "@devdigest/shared";
import { collectConflictAgents, isDivergentConflict } from "./helpers";
import { s } from "./styles";

export function WhereAgentsDisagree({ conflicts }: { conflicts: Conflict[] }) {
  const t = useTranslations("runs");
  const [onlyConflicts, setOnlyConflicts] = React.useState(false);

  const agents = React.useMemo(() => collectConflictAgents(conflicts), [conflicts]);
  const visibleConflicts = React.useMemo(
    () => (onlyConflicts ? conflicts.filter(isDivergentConflict) : conflicts),
    [conflicts, onlyConflicts],
  );

  if (conflicts.length === 0) {
    return <EmptyState icon="Users" title={t("conflicts.title")} body={t("conflicts.empty")} />;
  }

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.title}>{t("conflicts.title")}</h2>
        {/* Native <label> wrapping a (labelable) <button role="switch">
            gives the toggle an implicit accessible name + keeps it reachable
            via the tab order — no change to the shared Toggle primitive
            needed. */}
        <label style={s.toggleLabel}>
          <span>{t("conflicts.onlyConflicts")}</span>
          <Toggle on={onlyConflicts} onChange={setOnlyConflicts} size={16} />
        </label>
      </div>

      <div style={s.table} role="table" aria-label={t("conflicts.title")}>
        <div style={s.headerRow(agents.length)} role="row">
          <div style={s.headerCell} role="columnheader" />
          {agents.map((agent) => (
            <div key={agent.agentId} style={s.headerCell} role="columnheader">
              {agent.persona}
            </div>
          ))}
        </div>

        {visibleConflicts.map((conflict) => (
          <div key={`${conflict.file}:${conflict.line}`} style={s.row(agents.length)} role="row">
            <div style={s.locationCell} role="cell">
              <div style={s.location}>
                {conflict.file}:{conflict.line}
              </div>
              <div style={s.locationTitle}>{conflict.title}</div>
            </div>

            {agents.map((agent) => {
              const take = conflict.takes.find((candidate) => candidate.agent_id === agent.agentId);
              return (
                <div key={agent.agentId} style={s.cell} role="cell">
                  {take &&
                    (take.verdict === "ignored" ? (
                      <span style={s.ignored}>{t("conflicts.didNotFlag")}</span>
                    ) : (
                      <SeverityBadge severity={take.verdict} compact />
                    ))}
                  {take && (
                    <div style={s.note}>
                      <Markdown>{take.note}</Markdown>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
