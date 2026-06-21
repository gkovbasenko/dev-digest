/* SkillEditor — 4-tab editor (Config | Preview | Stats | Versions). */
"use client";

import React from "react";
import { Tabs, Icon, Badge, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useUpdateSkill } from "@/lib/hooks/skills";
import { ConfigTab } from "./_components/ConfigTab/ConfigTab";
import { PreviewTab } from "./_components/PreviewTab/PreviewTab";
import { StatsTab } from "./_components/StatsTab/StatsTab";
import { VersionsTab } from "./_components/VersionsTab/VersionsTab";
import { TABS } from "./constants";

const VALID_TABS = TABS as readonly string[];

const TAB_DEFS = [
  { key: "config", label: "Config", icon: "Settings" as const },
  { key: "preview", label: "Preview", icon: "Eye" as const },
  { key: "stats", label: "Stats", icon: "BarChart" as const },
  { key: "versions", label: "Versions", icon: "Clock" as const },
];

export function SkillEditor({
  skill,
  tab,
  onTab,
}: {
  skill: Skill;
  tab: string;
  onTab: (t: string) => void;
}) {
  const update = useUpdateSkill();
  const activeTab = VALID_TABS.includes(tab) ? tab : "config";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "16px 28px 0",
          flexShrink: 0,
        }}
      >
        <Icon.Sparkles size={18} style={{ color: "var(--accent)" }} />
        <h1 style={{ fontSize: 18, fontWeight: 700 }}>{skill.name}</h1>
        <Badge color="var(--text-secondary)" mono>
          v{skill.version}
        </Badge>
        {!skill.enabled && <Badge color="var(--text-muted)">disabled</Badge>}
        <div style={{ marginLeft: "auto" }}>
          <Toggle
            on={skill.enabled}
            size={14}
            onChange={(enabled) =>
              update.mutate({ id: skill.id, patch: { enabled } })
            }
          />
        </div>
      </div>

      {/* Tabs */}
      <div style={{ borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <Tabs
          tabs={TAB_DEFS.map((tb) => ({
            key: tb.key,
            label: tb.label,
            icon: tb.icon,
          }))}
          value={activeTab}
          onChange={onTab}
          pad="0 24px"
        />
      </div>

      {/* Tab body */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {activeTab === "config" && <ConfigTab skill={skill} />}
        {activeTab === "preview" && <PreviewTab skill={skill} />}
        {activeTab === "stats" && <StatsTab skillId={skill.id} />}
        {activeTab === "versions" && <VersionsTab skill={skill} />}
      </div>
    </div>
  );
}
