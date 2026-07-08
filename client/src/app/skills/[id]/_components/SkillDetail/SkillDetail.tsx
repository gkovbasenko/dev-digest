"use client";

import React from "react";
import { Tabs } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SkillPreview } from "../../../_components/SkillsView/SkillPreview";
import { SkillContextTab } from "../../../_components/SkillsView/SkillContextTab";
import { PreviewTab } from "./_components/PreviewTab";
import { StatsTab } from "./_components/StatsTab";
import { VersionsTab } from "./_components/VersionsTab";
import { TABS } from "./constants";
import { s } from "./styles";

export function SkillDetail({
  skill,
  tab,
  onTab,
  onDirtyChange,
  onDeleted,
}: {
  skill: Skill;
  tab: string;
  onTab: (t: string) => void;
  /** Reports whether the Config tab (SkillPreview) has an in-progress,
   *  unsaved edit — so the parent page can confirm before switching tabs,
   *  selecting a different skill, or navigating away. */
  onDirtyChange?: (dirty: boolean) => void;
  onDeleted?: () => void;
}) {
  const tabs = TABS.map((tb) => ({ ...tb }));
  // Mirrors SkillsView's isDirtyRef pattern: a ref (not state) so reading it
  // at click time doesn't trigger a re-render on every keystroke in
  // SkillPreview. Guards switching tabs here; the parent page uses its own
  // onDirtyChange forwarding to guard selecting a different skill.
  const isDirtyRef = React.useRef(false);
  const handleDirtyChange = (dirty: boolean) => {
    isDirtyRef.current = dirty;
    onDirtyChange?.(dirty);
  };

  const handleTabChange = (t: string) => {
    if (t === tab) return;
    if (isDirtyRef.current && !window.confirm("Discard unsaved changes to this skill?")) {
      return;
    }
    onTab(t);
  };

  return (
    <div style={s.wrap}>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={handleTabChange} pad="0 24px" />
      </div>
      {tab === "config" && (
        <div style={s.tabBody}>
          <SkillPreview skill={skill} onDirtyChange={handleDirtyChange} onDeleted={onDeleted} />
        </div>
      )}
      {tab === "context" && (
        <div style={s.body}>
          <SkillContextTab skillId={skill.id} />
        </div>
      )}
      {tab === "preview" && (
        <div style={s.body}>
          <PreviewTab skill={skill} />
        </div>
      )}
      {tab === "stats" && (
        <div style={s.body}>
          <StatsTab skillId={skill.id} />
        </div>
      )}
      {tab === "versions" && (
        <div style={s.tabBody}>
          <VersionsTab skillId={skill.id} currentVersion={skill.version} />
        </div>
      )}
    </div>
  );
}
