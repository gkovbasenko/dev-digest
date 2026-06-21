/* SkillCard — single row in the skills list. Shows name, type badge,
   description, enabled toggle, and stats line. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useUpdateSkill, useDeleteSkill } from "@/lib/hooks/skills";

const TYPE_COLOR: Record<string, string> = {
  rubric: "var(--accent)",
  convention: "var(--ok)",
  security: "var(--crit)",
  custom: "var(--warn)",
};

export function SkillCard({
  skill,
  active,
  onClick,
}: {
  skill: Skill;
  active?: boolean;
  onClick?: () => void;
}) {
  const t = useTranslations("skills");
  const update = useUpdateSkill();
  const del = useDeleteSkill();

  const color = TYPE_COLOR[skill.type] ?? "var(--text-muted)";

  return (
    <div
      onClick={onClick}
      style={{
        padding: "12px 14px",
        borderRadius: 8,
        border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
        background: active ? "var(--accent-bg)" : "var(--bg-surface)",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        opacity: skill.enabled ? 1 : 0.6,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            fontWeight: 600,
            fontSize: 13,
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {skill.name}
        </span>
        <Badge color={color}>{t(`listItem.type.${skill.type}`)}</Badge>
        <div onClick={(e) => e.stopPropagation()}>
          <Toggle
            on={skill.enabled}
            size={13}
            onChange={(enabled) =>
              update.mutate({ id: skill.id, patch: { enabled } })
            }
          />
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (
              window.confirm(
                `Delete skill "${skill.name}"? This cannot be undone.`,
              )
            ) {
              del.mutate(skill.id);
            }
          }}
          disabled={del.isPending}
          title="Delete skill"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--text-muted)",
            padding: 2,
            display: "inline-flex",
          }}
        >
          ✕
        </button>
      </div>
      {skill.description && (
        <div
          style={{
            fontSize: 12,
            color: "var(--text-secondary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {skill.description}
        </div>
      )}
      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
        {t(`listItem.source.${skill.source}`)} · v{skill.version}
        {!skill.enabled && (
          <>
            {" "}
            ·{" "}
            <span style={{ color: "var(--warn)" }}>
              {t("preview.disabled")}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
