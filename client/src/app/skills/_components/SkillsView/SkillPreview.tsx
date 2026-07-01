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
  // Optimistic local mirror of skill.enabled — without it, the Toggle only
  // moves once the mutation resolves and the query cache refreshes, which
  // reads as an unresponsive switch on a slow network. Reverted on error.
  const [enabled, setEnabled] = React.useState(skill.enabled);

  React.useEffect(() => {
    setBody(skill.body);
    setEnabled(skill.enabled);
    setEditing(false);
  }, [skill.id]);

  const typeColor = TYPE_COLORS[skill.type] ?? TYPE_COLORS.custom;
  const isUntrusted = skill.source !== "manual";

  const toggleEnabled = () => {
    // Without this guard, a second click before the first mutation's
    // onSuccess updates the cache would recompute !enabled from the same
    // stale value and send the same patch again — silently swallowing the
    // user's intent to toggle back.
    if (update.isPending) return;
    const previous = enabled;
    const next = !enabled;
    setEnabled(next);
    update.mutate(
      { id: skill.id, patch: { enabled: next } },
      { onError: () => setEnabled(previous) },
    );
  };

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
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)", opacity: update.isPending ? 0.6 : 1 }}>
            {enabled ? "Enabled" : "Disabled"}
            <Toggle on={enabled} onChange={toggleEnabled} size={16} />
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
