"use client";

import React from "react";
import { Badge, Checkbox, Icon, Markdown } from "@devdigest/ui";
import type { ContextDocument } from "@devdigest/shared";
// Runtime (value) import — pull the caps from the specific contract module, NOT
// the `@devdigest/shared` barrel. The barrel re-exports every contract via
// `./contracts/*.js` specifiers; a value import of it forces webpack to bundle
// that whole `.js`-re-export chain (bloats the client bundle and trips the
// `.js`→`.ts` resolution the barrel has never needed for type-only imports).
// See client INSIGHTS 2026-07-08.
import { PER_DOC_TOKEN_CAP, AGGREGATE_TOKEN_CAP } from "@devdigest/shared/contracts/context";
import {
  useContextDocs,
  useContextFilePreview,
  useAgentContext,
  useSetAgentContext,
} from "../../../../../../../lib/hooks/context";
import { useActiveRepo } from "../../../../../../../lib/repo-context";

function moveButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 18,
    height: 14,
    padding: 0,
    border: "none",
    borderRadius: 3,
    background: "transparent",
    color: disabled ? "var(--border-strong)" : "var(--text-muted)",
    cursor: disabled ? "default" : "pointer",
  };
}

function sumTokens(paths: string[], byPath: Map<string, ContextDocument>): number {
  return paths.reduce((sum, p) => sum + (byPath.get(p)?.token_count ?? 0), 0);
}

/**
 * Agent editor "Context" tab — attach/reorder Project Context docs discovered
 * from the currently active repo. Mirrors `SkillsTab`'s optimistic-local-order
 * + isPending-guarded toggle/drag/keyboard-reorder pattern (see client
 * INSIGHTS 2026-07-01, multiple entries).
 */
export function ContextTab({ agentId }: { agentId: string }) {
  const { repoId } = useActiveRepo();
  const { data: docList } = useContextDocs(repoId);
  const { data: linkedLinks } = useAgentContext(agentId);
  const setAgentContext = useSetAgentContext(agentId);

  const [filter, setFilter] = React.useState("");
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);
  const [capWarning, setCapWarning] = React.useState<string | null>(null);

  const allDocs = React.useMemo(() => docList?.documents ?? [], [docList]);
  const docsByPath = React.useMemo(() => new Map(allDocs.map((d) => [d.path, d])), [allDocs]);

  // Ordered list of attached paths (local state for drag optimism) — same
  // shape/rationale as SkillsTab's localOrder.
  const [localOrder, setLocalOrder] = React.useState<string[]>([]);
  const dragIndexRef = React.useRef<number | null>(null);
  const preDragOrderRef = React.useRef<string[]>([]);

  // Derived from localOrder (not linkedLinks) so linked/unlinked always agree
  // during the optimistic window — same reasoning as SkillsTab's linkedIds.
  const linkedIds = React.useMemo(() => new Set(localOrder), [localOrder]);

  React.useEffect(() => {
    if (!linkedLinks) return;
    const sorted = [...linkedLinks].sort((a, b) => a.order - b.order);
    setLocalOrder(sorted.map((l) => l.path));
  }, [linkedLinks]);

  const linkedDocs: ContextDocument[] = React.useMemo(
    () => localOrder.map((p) => docsByPath.get(p)).filter((d): d is ContextDocument => d !== undefined),
    [localOrder, docsByPath],
  );
  const unlinkedDocs: ContextDocument[] = React.useMemo(
    () => allDocs.filter((d) => !linkedIds.has(d.path)),
    [allDocs, linkedIds],
  );
  // Attached paths that are no longer in the repo's current discovery (file
  // renamed/deleted, or a scan/config change dropped it). They map to no
  // ContextDocument, so without a dedicated row they'd be undetachable, silently
  // re-saved on every persist, and would skew the "N of M" header count (C2).
  // Surface them as removable "missing" rows.
  const stalePaths = React.useMemo(
    () => localOrder.filter((p) => !docsByPath.has(p)),
    [localOrder, docsByPath],
  );

  const filteredLinked = linkedDocs.filter((d) => d.path.toLowerCase().includes(filter.toLowerCase()));
  const filteredUnlinked = unlinkedDocs.filter((d) => d.path.toLowerCase().includes(filter.toLowerCase()));
  const filteredStale = stalePaths.filter((p) => p.toLowerCase().includes(filter.toLowerCase()));
  const isFiltering = filter.trim().length > 0;

  const pending = setAgentContext.isPending;
  const total = allDocs.length + stalePaths.length;
  const linked = linkedIds.size;
  const aggregateTokens = sumTokens(localOrder, docsByPath);

  const persist = (newOrder: string[], previousOrder: string[]) => {
    setCapWarning(null);
    setLocalOrder(newOrder);
    setAgentContext.mutate(
      { paths: newOrder, repoId: repoId ?? undefined },
      { onError: () => setLocalOrder(previousOrder) },
    );
  };

  const handleToggle = (path: string, checked: boolean) => {
    if (pending) return;
    const previousOrder = localOrder;
    if (checked) {
      if (localOrder.includes(path)) return;
      const doc = docsByPath.get(path);
      // Blocked control: a doc over the per-doc cap can't be attached at all.
      if (doc && doc.token_count > PER_DOC_TOKEN_CAP) return;
      const prospective = [...localOrder, path];
      const prospectiveTotal = sumTokens(prospective, docsByPath);
      if (prospectiveTotal > AGGREGATE_TOKEN_CAP) {
        setCapWarning(
          `Attaching "${path}" would bring the total to ~${prospectiveTotal} tokens, over the ${AGGREGATE_TOKEN_CAP.toLocaleString()}-token aggregate cap. Detach something first.`,
        );
        return;
      }
      persist(prospective, previousOrder);
    } else {
      persist(
        localOrder.filter((p) => p !== path),
        previousOrder,
      );
    }
  };

  const handleDragStart = (idx: number) => {
    if (pending || isFiltering) return;
    dragIndexRef.current = idx;
    preDragOrderRef.current = localOrder;
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    const from = dragIndexRef.current;
    if (from === null || from < 0 || from >= localOrder.length || from === idx) return;
    const newOrder = [...localOrder];
    const moved = newOrder.splice(from, 1)[0]!;
    newOrder.splice(idx, 0, moved);
    dragIndexRef.current = idx;
    setLocalOrder(newOrder);
  };

  const handleDragEnd = () => {
    dragIndexRef.current = null;
    if (pending) return;
    const previousOrder = preDragOrderRef.current;
    if (localOrder.length === previousOrder.length && localOrder.every((p, i) => p === previousOrder[i])) {
      return;
    }
    persist(localOrder, previousOrder);
  };

  const moveLinked = (realIdx: number, direction: -1 | 1) => {
    if (pending) return;
    if (realIdx < 0 || realIdx >= localOrder.length) return;
    const targetIdx = realIdx + direction;
    if (targetIdx < 0 || targetIdx >= localOrder.length) return;
    const previousOrder = localOrder;
    const newOrder = [...localOrder];
    const tmp = newOrder[realIdx]!;
    newOrder[realIdx] = newOrder[targetIdx]!;
    newOrder[targetIdx] = tmp;
    persist(newOrder, previousOrder);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Header */}
      <div style={{ padding: "20px 24px 12px", borderBottom: "1px solid var(--border)" }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Project context</h2>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter documents…"
          style={{
            width: "100%",
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid var(--border-strong)",
            background: "var(--bg-primary)",
            color: "var(--text-primary)",
            fontSize: 14,
            outline: "none",
          }}
        />
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8 }}>
          Project context — {linked} of {total} attached
        </div>
        {capWarning && (
          <div
            role="alert"
            style={{
              marginTop: 8,
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
      </div>

      {/* Document rows */}
      <div style={{ flex: 1, overflow: "auto", padding: "8px 16px" }}>
        {filteredLinked.map((doc) => {
          const realIdx = localOrder.indexOf(doc.path);
          return (
            <div key={doc.path}>
              <div
                draggable
                onDragStart={() => handleDragStart(realIdx)}
                onDragOver={(e) => handleDragOver(e, realIdx)}
                onDragEnd={handleDragEnd}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 8px",
                  borderRadius: 8,
                  marginBottom: 2,
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                  opacity: pending ? 0.6 : 1,
                  cursor: "grab",
                }}
              >
                <Icon.GripVertical size={16} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                <Checkbox checked={true} onChange={() => handleToggle(doc.path, false)} />
                <span
                  className="mono"
                  style={{ flex: 1, fontSize: 13, color: "var(--text-primary)", overflowWrap: "anywhere" }}
                >
                  {doc.path}
                </span>
                <Badge>{doc.badge}</Badge>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>≈{doc.token_count} tokens</span>
                <button
                  type="button"
                  aria-label={`Preview ${doc.path}`}
                  onClick={() => setPreviewPath((p) => (p === doc.path ? null : doc.path))}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 4 }}
                >
                  <Icon.Eye size={14} />
                </button>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <button
                    type="button"
                    aria-label={`Move ${doc.path} up`}
                    title={isFiltering ? "Clear the filter to reorder" : undefined}
                    onClick={() => moveLinked(realIdx, -1)}
                    disabled={pending || isFiltering || realIdx === 0}
                    style={moveButtonStyle(pending || isFiltering || realIdx === 0)}
                  >
                    <Icon.ArrowUp size={12} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${doc.path} down`}
                    title={isFiltering ? "Clear the filter to reorder" : undefined}
                    onClick={() => moveLinked(realIdx, 1)}
                    disabled={pending || isFiltering || realIdx === localOrder.length - 1}
                    style={moveButtonStyle(pending || isFiltering || realIdx === localOrder.length - 1)}
                  >
                    <Icon.ArrowDown size={12} />
                  </button>
                </div>
              </div>
              {previewPath === doc.path && <DocPreview repoId={repoId} path={doc.path} />}
            </div>
          );
        })}

        {filteredStale.map((path) => (
          <div key={path}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 8px",
                borderRadius: 8,
                marginBottom: 2,
                background: "var(--bg-surface)",
                border: "1px solid var(--warn, #f59e0b)",
                opacity: pending ? 0.6 : 1,
              }}
            >
              <Icon.GripVertical size={16} style={{ color: "transparent", flexShrink: 0 }} />
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
          </div>
        ))}

        {filteredUnlinked.map((doc) => {
          const overCap = doc.token_count > PER_DOC_TOKEN_CAP;
          return (
            <div key={doc.path}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 8px",
                  borderRadius: 8,
                  marginBottom: 2,
                  opacity: pending || overCap ? 0.6 : 1,
                }}
              >
                <Icon.GripVertical size={16} style={{ color: "transparent", flexShrink: 0 }} />
                <span title={overCap ? `Over the ${PER_DOC_TOKEN_CAP.toLocaleString()}-token per-doc cap — can't attach` : undefined}>
                  <Checkbox checked={false} onChange={() => handleToggle(doc.path, true)} />
                </span>
                <span
                  className="mono"
                  style={{ flex: 1, fontSize: 13, color: "var(--text-secondary)", overflowWrap: "anywhere" }}
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
                  onClick={() => setPreviewPath((p) => (p === doc.path ? null : doc.path))}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 4 }}
                >
                  <Icon.Eye size={14} />
                </button>
              </div>
              {previewPath === doc.path && <DocPreview repoId={repoId} path={doc.path} />}
            </div>
          );
        })}

        {total === 0 && (
          <div style={{ padding: "32px 0", textAlign: "center", fontSize: 14, color: "var(--text-muted)" }}>
            No project context docs discovered for the active repo yet.
          </div>
        )}
      </div>

      {/* Footer */}
      {linked > 0 && (
        <div
          style={{
            padding: "10px 24px",
            borderTop: "1px solid var(--border)",
            fontSize: 12,
            color: "var(--text-muted)",
          }}
        >
          ≈{aggregateTokens} tokens · Injected as an untrusted block (## Project context) into every run
        </div>
      )}
    </div>
  );
}

function DocPreview({ repoId, path }: { repoId: string | null | undefined; path: string }) {
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
