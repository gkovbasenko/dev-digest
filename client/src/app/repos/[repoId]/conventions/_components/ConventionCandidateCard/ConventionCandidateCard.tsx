"use client";

import React from "react";
import { Badge, MonoLink, ConfidenceNum, Button, TextInput, SelectInput } from "@devdigest/ui";
import type { ConventionCandidate, ConventionCategory } from "@devdigest/shared";
import { CATEGORY_META, CATEGORY_OPTIONS } from "./constants";
import { evidenceHref } from "./helpers";
import { s } from "./styles";

export interface ConventionActionPatch {
  rule?: string;
  category?: string | null;
  accepted?: boolean;
  rejected?: boolean;
}

export function ConventionCandidateCard({
  c,
  onAction,
  pending,
  repoFullName,
  defaultBranch,
}: {
  c: ConventionCandidate;
  onAction: (patch: ConventionActionPatch) => void;
  pending?: boolean;
  repoFullName?: string | null;
  defaultBranch?: string | null;
}) {
  const [editing, setEditing] = React.useState(false);
  const [ruleDraft, setRuleDraft] = React.useState(c.rule);
  const [categoryDraft, setCategoryDraft] = React.useState<ConventionCategory>(
    c.category ?? "other",
  );

  const muted = c.accepted || c.rejected;
  const catMeta = c.category ? CATEGORY_META[c.category] : null;
  const href = evidenceHref(repoFullName, defaultBranch, c.evidence_path);

  const startEdit = () => {
    setRuleDraft(c.rule);
    setCategoryDraft(c.category ?? "other");
    setEditing(true);
  };

  const save = () => {
    if (!ruleDraft.trim()) return;
    onAction({ rule: ruleDraft.trim(), category: categoryDraft });
    setEditing(false);
  };

  return (
    <div style={s.card(muted)}>
      <div style={s.titleRow}>
        {editing ? null : <span style={s.title(muted)}>{c.rule}</span>}
        {catMeta && <Badge icon={catMeta.icon}>{catMeta.label}</Badge>}
        {c.accepted && <span style={s.acceptedTag}>Accepted</span>}
        {c.rejected && <span style={s.rejectedTag}>Rejected</span>}
      </div>

      <div style={s.metaRow}>
        {c.evidence_path && <MonoLink href={href}>{c.evidence_path}</MonoLink>}
        {c.confidence != null && <ConfidenceNum value={c.confidence} />}
      </div>

      {c.evidence_snippet && <pre style={s.snippet}>{c.evidence_snippet}</pre>}

      {editing && (
        <div style={s.editStack}>
          <TextInput value={ruleDraft} onChange={setRuleDraft} placeholder="Rule text" />
          <SelectInput
            value={categoryDraft}
            onChange={(v) => setCategoryDraft(v as ConventionCategory)}
            options={CATEGORY_OPTIONS}
          />
        </div>
      )}

      <div style={s.actions}>
        {editing ? (
          <>
            <Button kind="primary" size="sm" disabled={!ruleDraft.trim() || pending} onClick={save}>
              Save
            </Button>
            <Button kind="ghost" size="sm" disabled={pending} onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button
              kind="secondary"
              size="sm"
              icon="Check"
              disabled={pending}
              active={c.accepted}
              onClick={() => onAction({ accepted: true })}
            >
              Accept
            </Button>
            <Button
              kind="ghost"
              size="sm"
              icon="X"
              disabled={pending}
              active={c.rejected}
              onClick={() => onAction({ rejected: true })}
            >
              Reject
            </Button>
            <Button kind="tertiary" size="sm" disabled={pending} onClick={startEdit}>
              Edit
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
