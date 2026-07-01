"use client";

import React from "react";
import { Badge, Markdown, Toggle, Button, FormField, Textarea } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useUpdateSkill } from "../../../../lib/hooks/skills";
import { useToast } from "../../../../lib/toast";
import { s } from "./styles";

const TYPE_COLORS: Record<SkillType, { color: string; bg: string }> = {
  rubric: { color: "#a78bfa", bg: "rgba(167,139,250,0.12)" },
  convention: { color: "#34d399", bg: "rgba(52,211,153,0.12)" },
  security: { color: "#f87171", bg: "rgba(248,113,113,0.12)" },
  custom: { color: "var(--text-muted)", bg: "var(--bg-hover)" },
};

export function SkillPreview({ skill }: { skill: Skill }) {
  const update = useUpdateSkill();
  const toast = useToast();
  const [editing, setEditing] = React.useState(false);
  const [body, setBody] = React.useState(skill.body);

  React.useEffect(() => {
    setBody(skill.body);
    setEditing(false);
  }, [skill.id]);

  const typeColor = TYPE_COLORS[skill.type] ?? TYPE_COLORS.custom;
  const isUntrusted = skill.source === "imported_url";

  const toggleEnabled = () =>
    update.mutate({ id: skill.id, patch: { enabled: !skill.enabled } });

  const saveBody = () =>
    update.mutate(
      { id: skill.id, patch: { body } },
      {
        onSuccess: () => {
          setEditing(false);
          toast.success("Skill saved");
        },
      },
    );

  return (
    <div style={s.preview}>
      <div style={s.previewHeader}>
        <h1 style={s.previewTitle}>{skill.name}</h1>
        <div style={s.previewMeta}>
          <Badge color={typeColor.color} bg={typeColor.bg}>{skill.type}</Badge>
          <Badge color="var(--text-muted)" bg="var(--bg-hover)">v{skill.version}</Badge>
          {isUntrusted && (
            <Badge color="#f59e0b" bg="rgba(245,158,11,0.12)">untrusted source</Badge>
          )}
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)" }}>
            {skill.enabled ? "Enabled" : "Disabled"}
            <Toggle on={skill.enabled} onChange={toggleEnabled} size={16} />
          </label>
        </div>
      </div>

      {isUntrusted && (
        <div style={s.untrustedNotice}>
          This skill came from an untrusted source. Its body is stored as data (delimiter-wrapped)
          and must be vetted before it is enabled for an agent.
        </div>
      )}

      <div>
        <div style={s.bodyLabel}>Skill body (Markdown)</div>
        {editing ? (
          <Textarea value={body} onChange={setBody} rows={16} mono />
        ) : (
          <div style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6 }}>
            <Markdown>{skill.body}</Markdown>
          </div>
        )}
      </div>

      <div style={s.previewActions}>
        {editing ? (
          <>
            <Button kind="primary" onClick={saveBody} disabled={update.isPending}>
              {update.isPending ? "Saving…" : "Save"}
            </Button>
            <Button kind="ghost" onClick={() => { setEditing(false); setBody(skill.body); }}>
              Cancel
            </Button>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Saving a changed body creates a new immutable version.
            </span>
          </>
        ) : (
          <Button kind="secondary" icon="Edit" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
      </div>
    </div>
  );
}
