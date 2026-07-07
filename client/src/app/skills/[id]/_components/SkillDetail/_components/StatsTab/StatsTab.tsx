"use client";

import React from "react";
import { Badge, Skeleton, EmptyState } from "@devdigest/ui";
import { useSkillStats } from "../../../../../../../lib/hooks/skills";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

/** Usage stats for a skill: how many agents use it, how many versions it
 *  has, how often it's shown up in a run, and when it was last used. */
export function StatsTab({ skillId }: { skillId: string }) {
  const { data: stats, isLoading, isError } = useSkillStats(skillId);

  if (isLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Skeleton height={52} />
        <Skeleton height={52} />
        <Skeleton height={52} />
      </div>
    );
  }

  if (isError || !stats) {
    return (
      <EmptyState
        icon="AlertTriangle"
        title="Couldn't load stats"
        body="Stats for this skill could not be loaded."
      />
    );
  }

  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "Agents using this skill", value: stats.agent_count },
    { label: "Versions", value: stats.version_count },
    { label: "Times used in a run", value: stats.run_usage_count },
    {
      label: "Last used",
      value: stats.last_used_at ? formatDate(stats.last_used_at) : "Never used",
    },
    { label: "Source", value: <Badge color="var(--text-muted)" bg="var(--bg-hover)">{stats.source}</Badge> },
    { label: "Created", value: formatDate(stats.created_at) },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, maxWidth: 480 }}>
      {rows.map((row) => (
        <div
          key={row.label}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 0",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{row.label}</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{row.value}</span>
        </div>
      ))}
    </div>
  );
}
