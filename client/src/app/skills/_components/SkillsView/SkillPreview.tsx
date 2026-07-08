"use client";

import React from "react";
import { Icon, Badge, Markdown, Toggle, Button, TextInput, SelectInput, Textarea } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useUpdateSkill, useDeleteSkill } from "../../../../lib/hooks/skills";
import { useToast } from "../../../../lib/toast";
import { s } from "./styles";

const TYPE_COLORS: Record<SkillType, { color: string; bg: string }> = {
  rubric: { color: "#a78bfa", bg: "rgba(167,139,250,0.12)" },
  convention: { color: "#34d399", bg: "rgba(52,211,153,0.12)" },
  security: { color: "#f87171", bg: "rgba(248,113,113,0.12)" },
  custom: { color: "var(--text-muted)", bg: "var(--bg-hover)" },
};

const TYPE_OPTIONS: { value: SkillType; label: string }[] = [
  { value: "rubric", label: "Rubric" },
  { value: "convention", label: "Convention" },
  { value: "security", label: "Security" },
  { value: "custom", label: "Custom" },
];

export function SkillPreview({
  skill,
  onDirtyChange,
  onDeleted,
}: {
  skill: Skill;
  /** Reports whether there's an in-progress, unsaved body edit — so the
   *  parent (which owns skill selection) can confirm before switching away
   *  and silently discarding it. */
  onDirtyChange?: (dirty: boolean) => void;
  /** Called after this skill is successfully deleted, so the parent can
   *  clear the selection (the skill's own query cache entry is already
   *  removed by useDeleteSkill, so re-selecting it would just 404). */
  onDeleted?: () => void;
}) {
  const update = useUpdateSkill();
  const del = useDeleteSkill();
  const toast = useToast();
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(skill.name);
  const [type, setType] = React.useState<SkillType>(skill.type);
  const [body, setBody] = React.useState(skill.body);
  const [description, setDescription] = React.useState(skill.description);
  // Optimistic local mirror of skill.enabled — without it, the Toggle only
  // moves once the mutation resolves and the query cache refreshes, which
  // reads as an unresponsive switch on a slow network. Reverted on error.
  const [enabled, setEnabled] = React.useState(skill.enabled);

  React.useEffect(() => {
    setName(skill.name);
    setType(skill.type);
    setBody(skill.body);
    setDescription(skill.description);
    setEnabled(skill.enabled);
    setEditing(false);
  }, [skill.id]);

  const isDirty =
    editing &&
    (name !== skill.name || type !== skill.type || body !== skill.body || description !== skill.description);
  React.useEffect(() => {
    onDirtyChange?.(isDirty);
    // Clear the dirty flag on unmount (switching away via the key change) so
    // the parent doesn't keep thinking there's a pending edit once this
    // instance is gone.
    return () => onDirtyChange?.(false);
  }, [isDirty, onDirtyChange]);

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

  const saveEdits = () => {
    if (!name.trim()) return;
    update.mutate(
      // name/type/description-only edits don't bump the skill's version —
      // the server only bumps it when `body` actually changes.
      { id: skill.id, patch: { name: name.trim(), type, body, description } },
      {
        onSuccess: () => {
          setEditing(false);
          toast.success("Skill saved");
        },
      },
    );
  };

  const handleDelete = () => {
    if (!window.confirm(`Delete skill "${skill.name}"? This cannot be undone.`)) return;
    del.mutate(skill.id, {
      onSuccess: () => {
        toast.success(`Skill "${skill.name}" deleted.`);
        onDeleted?.();
      },
    });
  };

  return (
    <div style={s.preview}>
      <div style={s.previewHeader}>
        {editing ? (
          <TextInput value={name} onChange={setName} placeholder="Skill name" />
        ) : (
          <h1 style={s.previewTitle}>{skill.name}</h1>
        )}
        <div style={s.previewMeta}>
          {editing ? (
            <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={TYPE_OPTIONS} />
          ) : (
            <Badge color={typeColor.color} bg={typeColor.bg}>{skill.type}</Badge>
          )}
          <Badge color="var(--text-muted)" bg="var(--bg-hover)">v{skill.version}</Badge>
          {isUntrusted && (
            <Badge color="#f59e0b" bg="rgba(245,158,11,0.12)">untrusted source</Badge>
          )}
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)", opacity: update.isPending ? 0.6 : 1 }}>
            {enabled ? "Enabled" : "Disabled"}
            <Toggle on={enabled} onChange={toggleEnabled} size={16} />
          </label>
          <button
            onClick={handleDelete}
            disabled={del.isPending}
            title="Delete skill"
            aria-label="Delete skill"
            style={{
              background: "none",
              border: "none",
              cursor: del.isPending ? "not-allowed" : "pointer",
              color: "var(--text-muted)",
              display: "inline-flex",
              padding: 4,
            }}
          >
            <Icon.Trash size={14} style={del.isPending ? { animation: "ddspin 1s linear infinite" } : undefined} />
          </button>
        </div>
      </div>

      {isUntrusted && (
        <div style={s.untrustedNotice}>
          This skill came from an untrusted source. Its body is stored as data (delimiter-wrapped)
          and must be vetted before it is enabled for an agent.
        </div>
      )}

      <div>
        <div style={s.bodyLabel}>Description</div>
        {editing ? (
          <Textarea
            value={description}
            onChange={setDescription}
            rows={3}
            placeholder="What does this skill check?"
          />
        ) : (
          <div
            style={{
              fontSize: 14,
              color: skill.description ? "var(--text-secondary)" : "var(--text-muted)",
              lineHeight: 1.5,
            }}
          >
            {skill.description || "No description"}
          </div>
        )}
      </div>

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
            <Button kind="primary" onClick={saveEdits} disabled={!name.trim() || update.isPending}>
              {update.isPending ? "Saving…" : "Save"}
            </Button>
            <Button
              kind="ghost"
              onClick={() => {
                setEditing(false);
                setName(skill.name);
                setType(skill.type);
                setBody(skill.body);
                setDescription(skill.description);
              }}
            >
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
