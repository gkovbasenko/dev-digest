"use client";

import React from "react";
import { Badge, Checkbox, Icon, Markdown } from "@devdigest/ui";
import type { ContextBadge, ContextDocument } from "@devdigest/shared";
// Runtime (value) import — from the specific contract module, not the barrel
// (a value import of `@devdigest/shared` bundles every contract + trips webpack
// `.js`→`.ts` resolution). See client INSIGHTS 2026-07-08.
import { PER_DOC_TOKEN_CAP, AGGREGATE_TOKEN_CAP } from "@devdigest/shared/contracts/context";
import {
  useContextDocs,
  useContextFilePreview,
  useSkillContext,
  useSetSkillContext,
} from "../../../../lib/hooks/context";
import { useActiveRepo } from "../../../../lib/repo-context";

/** Human-friendly grouping heading per badge, for the "SERIALIZES AS" preview. */
const SERIALIZE_HEADING: Record<ContextBadge, string> = {
  specs: "## Project specifications",
  docs: "## Project documentation",
  insights: "## Project insights",
};

function sumTokens(paths: string[], byPath: Map<string, ContextDocument>): number {
  return paths.reduce((sum, p) => sum + (byPath.get(p)?.token_count ?? 0), 0);
}

/**
 * Skill editor "Context" tab. A skill's attached docs are INHERITED by every
 * agent that has this skill enabled (AC-9) — this tab explains that, lets the
 * author attach/detach docs from the active repo under the same 50k/150k
 * caps as the agent side, and shows a "SERIALIZES AS" preview of exactly what
 * gets grouped under which heading when injected.
 */
export function SkillContextTab({ skillId }: { skillId: string }) {
  const { repoId } = useActiveRepo();
  const { data: docList } = useContextDocs(repoId);
  const { data: linkedLinks } = useSkillContext(skillId);
  const setSkillContext = useSetSkillContext(skillId);

  const [previewPath, setPreviewPath] = React.useState<string | null>(null);
  const [capWarning, setCapWarning] = React.useState<string | null>(null);

  const allDocs = React.useMemo(() => docList?.documents ?? [], [docList]);
  const docsByPath = React.useMemo(() => new Map(allDocs.map((d) => [d.path, d])), [allDocs]);

  const [localOrder, setLocalOrder] = React.useState<string[]>([]);
  React.useEffect(() => {
    if (!linkedLinks) return;
    const sorted = [...linkedLinks].sort((a, b) => a.order - b.order);
    setLocalOrder(sorted.map((l) => l.path));
  }, [linkedLinks]);

  const linkedIds = React.useMemo(() => new Set(localOrder), [localOrder]);
  const linkedDocs: ContextDocument[] = React.useMemo(
    () => localOrder.map((p) => docsByPath.get(p)).filter((d): d is ContextDocument => d !== undefined),
    [localOrder, docsByPath],
  );
  const unlinkedDocs: ContextDocument[] = React.useMemo(
    () => allDocs.filter((d) => !linkedIds.has(d.path)),
    [allDocs, linkedIds],
  );
  // Attached paths no longer in the repo's current discovery — render as
  // removable "missing" rows so they can't get stuck undetachable, silently
  // re-saved, or skew the header count (C2).
  const stalePaths = React.useMemo(
    () => localOrder.filter((p) => !docsByPath.has(p)),
    [localOrder, docsByPath],
  );

  const pending = setSkillContext.isPending;
  const total = allDocs.length + stalePaths.length;
  const linked = linkedIds.size;
  const aggregateTokens = sumTokens(localOrder, docsByPath);

  const handleToggle = (path: string, checked: boolean) => {
    if (pending) return;
    const previousOrder = localOrder;
    let newOrder: string[];
    if (checked) {
      if (localOrder.includes(path)) return;
      const doc = docsByPath.get(path);
      if (doc && doc.token_count > PER_DOC_TOKEN_CAP) return;
      const prospective = [...localOrder, path];
      const prospectiveTotal = sumTokens(prospective, docsByPath);
      if (prospectiveTotal > AGGREGATE_TOKEN_CAP) {
        setCapWarning(
          `Attaching "${path}" would bring the total to ~${prospectiveTotal} tokens, over the ${AGGREGATE_TOKEN_CAP.toLocaleString()}-token aggregate cap. Detach something first.`,
        );
        return;
      }
      newOrder = prospective;
    } else {
      newOrder = localOrder.filter((p) => p !== path);
    }
    setCapWarning(null);
    setLocalOrder(newOrder);
    setSkillContext.mutate(
      { paths: newOrder, repoId: repoId ?? undefined },
      { onError: () => setLocalOrder(previousOrder) },
    );
  };

  // Group the currently attached (and about-to-be-injected) docs by badge for
  // the "SERIALIZES AS" preview, preserving attach order within each group.
  const serializedGroups = React.useMemo(() => {
    const groups = new Map<ContextBadge, string[]>();
    for (const doc of linkedDocs) {
      const arr = groups.get(doc.badge) ?? [];
      arr.push(doc.path);
      groups.set(doc.badge, arr);
    }
    return groups;
  }, [linkedDocs]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Project context to use</div>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5, margin: 0 }}>
          Docs attached here are inherited by every agent that has this skill enabled — they&apos;re
          injected into that run&apos;s untrusted <code>## Project context</code> block alongside
          anything the agent attaches directly (deduped, agent-first).
        </p>
      </div>

      <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
        Project context — {linked} of {total} attached
      </div>

      {capWarning && (
        <div
          role="alert"
          style={{
            padding: "8px 10px",
            borderRadius: 6,
            fontSize: 12.5,
            color: "var(--warn, #f59e0b)",
            background: "var(--warn-bg, rgba(245,158,11,0.12))",
          }}
        >
          {capWarning}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {linkedDocs.map((doc) => (
          <DocRow
            key={doc.path}
            doc={doc}
            checked
            pending={pending}
            onToggle={(checked) => handleToggle(doc.path, checked)}
            onPreview={() => setPreviewPath((p) => (p === doc.path ? null : doc.path))}
            previewing={previewPath === doc.path}
            repoId={repoId}
          />
        ))}
        {unlinkedDocs.map((doc) => (
          <DocRow
            key={doc.path}
            doc={doc}
            checked={false}
            pending={pending}
            onToggle={(checked) => handleToggle(doc.path, checked)}
            onPreview={() => setPreviewPath((p) => (p === doc.path ? null : doc.path))}
            previewing={previewPath === doc.path}
            repoId={repoId}
          />
        ))}
        {stalePaths.map((path) => (
          <div
            key={path}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 8px",
              borderRadius: 8,
              background: "var(--bg-surface)",
              border: "1px solid var(--warn, #f59e0b)",
              opacity: pending ? 0.6 : 1,
            }}
          >
            <Checkbox checked={true} onChange={() => handleToggle(path, false)} />
            <span
              className="mono"
              style={{ flex: 1, fontSize: 13, color: "var(--text-primary)", overflowWrap: "anywhere" }}
            >
              {path}
            </span>
            <Badge color="var(--warn, #f59e0b)" bg="var(--warn-bg, rgba(245,158,11,0.12))">
              not in current scan
            </Badge>
          </div>
        ))}
        {total === 0 && (
          <div style={{ padding: "24px 0", textAlign: "center", fontSize: 14, color: "var(--text-muted)" }}>
            No project context docs discovered for the active repo yet.
          </div>
        )}
      </div>

      {linked > 0 && (
        <>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            ≈{aggregateTokens} tokens · Injected as an untrusted block (## Project context) into every run
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>
              SERIALIZES AS
            </div>
            <pre
              style={{
                margin: 0,
                padding: 12,
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--bg-primary)",
                fontSize: 12.5,
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
              }}
            >
              {[...serializedGroups.entries()]
                .map(([badge, paths]) => `${SERIALIZE_HEADING[badge]}\n${paths.map((p) => `- ${p}`).join("\n")}`)
                .join("\n\n")}
            </pre>
          </div>
        </>
      )}
    </div>
  );
}

function DocRow({
  doc,
  checked,
  pending,
  onToggle,
  onPreview,
  previewing,
  repoId,
}: {
  doc: ContextDocument;
  checked: boolean;
  pending: boolean;
  onToggle: (checked: boolean) => void;
  onPreview: () => void;
  previewing: boolean;
  repoId: string | null | undefined;
}) {
  const overCap = !checked && doc.token_count > PER_DOC_TOKEN_CAP;
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 8px",
          borderRadius: 8,
          background: checked ? "var(--bg-surface)" : "transparent",
          border: checked ? "1px solid var(--border)" : "1px solid transparent",
          opacity: pending || overCap ? 0.6 : 1,
        }}
      >
        <span title={overCap ? `Over the ${PER_DOC_TOKEN_CAP.toLocaleString()}-token per-doc cap — can't attach` : undefined}>
          <Checkbox checked={checked} onChange={onToggle} />
        </span>
        <span
          className="mono"
          style={{ flex: 1, fontSize: 13, color: checked ? "var(--text-primary)" : "var(--text-secondary)", overflowWrap: "anywhere" }}
        >
          {doc.path}
        </span>
        <Badge>{doc.badge}</Badge>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>≈{doc.token_count} tokens</span>
        {overCap && (
          <Badge color="var(--warn, #f59e0b)" bg="var(--warn-bg, rgba(245,158,11,0.12))">
            over cap
          </Badge>
        )}
        <button
          type="button"
          aria-label={`Preview ${doc.path}`}
          onClick={onPreview}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 4 }}
        >
          <Icon.Eye size={14} />
        </button>
      </div>
      {previewing && <SkillContextDocPreview repoId={repoId} path={doc.path} />}
    </div>
  );
}

function SkillContextDocPreview({ repoId, path }: { repoId: string | null | undefined; path: string }) {
  const preview = useContextFilePreview(repoId, path);
  return (
    <div
      style={{
        margin: "0 8px 8px",
        padding: 12,
        borderRadius: 8,
        border: "1px solid var(--border)",
        background: "var(--bg-primary)",
        fontSize: 13,
      }}
    >
      {preview.isLoading ? "Loading…" : <Markdown>{preview.data?.content ?? ""}</Markdown>}
    </div>
  );
}
