/* AgentCardGrid — one card per agent on the Eval Dashboard's list view (AC-15):
   RECALL/PRECISION/CITATION %, a Sparkline, and "Last run vN · date · P/T pass". */
import React from "react";
import { Icon, Sparkline } from "@devdigest/ui";
import { formatEvalPercent } from "@/components/eval";
import { formatLastRun, type EvalAgentCard } from "./helpers";
import { s } from "./styles";

export function AgentCardGrid({
  agents,
  onSelect,
}: {
  agents: EvalAgentCard[];
  onSelect: (agentId: string) => void;
}) {
  return (
    <div style={s.grid}>
      {agents.map((agent) => (
        <button
          key={agent.agent_id}
          type="button"
          style={s.card}
          onClick={() => onSelect(agent.agent_id)}
        >
          <div style={s.header}>
            <div style={s.iconBox}>
              <Icon.Cpu size={14} />
            </div>
            <span style={s.name}>{agent.agent_name}</span>
          </div>
          <div style={s.metricsRow}>
            <div style={s.metrics}>
              <div style={s.metric}>
                <span style={s.metricLabel}>Recall</span>
                <span className="tnum" style={s.metricValue}>{formatEvalPercent(agent.recall)}</span>
              </div>
              <div style={s.metric}>
                <span style={s.metricLabel}>Precision</span>
                <span className="tnum" style={s.metricValue}>{formatEvalPercent(agent.precision)}</span>
              </div>
              <div style={s.metric}>
                <span style={s.metricLabel}>Citation</span>
                <span className="tnum" style={s.metricValue}>{formatEvalPercent(agent.citation_accuracy)}</span>
              </div>
            </div>
            <span style={s.spark}>
              <Sparkline data={agent.sparkline} w={60} h={22} />
            </span>
          </div>
          <div style={s.footer}>{formatLastRun(agent)}</div>
        </button>
      ))}
    </div>
  );
}
