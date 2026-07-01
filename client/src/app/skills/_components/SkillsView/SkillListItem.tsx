"use client";

import React from "react";
import { Badge } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { s } from "./styles";

const TYPE_COLORS: Record<SkillType, { color: string; bg: string }> = {
  rubric: { color: "#a78bfa", bg: "rgba(167,139,250,0.12)" },
  convention: { color: "#34d399", bg: "rgba(52,211,153,0.12)" },
  security: { color: "#f87171", bg: "rgba(248,113,113,0.12)" },
  custom: { color: "var(--text-muted)", bg: "var(--bg-hover)" },
};

export function SkillListItem({
  skill,
  active,
  onClick,
}: {
  skill: Skill;
  active: boolean;
  onClick: () => void;
}) {
  const typeColor = TYPE_COLORS[skill.type] ?? TYPE_COLORS.custom;
  const needsVetting = !skill.enabled && skill.source !== "manual";

  return (
    <div style={s.item(active)} onClick={onClick} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onClick()}>
      <div style={s.itemMain}>
        <div style={s.itemName}>{skill.name}</div>
        <div style={s.itemMeta}>
          <Badge color={typeColor.color} bg={typeColor.bg}>{skill.type}</Badge>
          {needsVetting && (
            <Badge color="#f59e0b" bg="rgba(245,158,11,0.12)">needs vetting</Badge>
          )}
        </div>
      </div>
    </div>
  );
}
