"use client";

import React from "react";
import Link from "next/link";
import { Badge, Checkbox, Icon } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useSkills, useAgentSkills, useSetAgentSkills } from "../../../../../../../lib/hooks/skills";

const TYPE_COLORS: Record<SkillType, { color: string; bg: string }> = {
  rubric: { color: "#a78bfa", bg: "rgba(167,139,250,0.12)" },
  convention: { color: "#34d399", bg: "rgba(52,211,153,0.12)" },
  security: { color: "#f87171", bg: "rgba(248,113,113,0.12)" },
  custom: { color: "var(--text-muted)", bg: "var(--bg-hover)" },
};

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

export function SkillsTab({ agentId }: { agentId: string }) {
  const { data: allSkills } = useSkills();
  const { data: linkedLinks } = useAgentSkills(agentId);
  const setAgentSkills = useSetAgentSkills(agentId);

  const [filter, setFilter] = React.useState("");

  // Ordered list of linked skill IDs (local state for drag optimism)
  const [localOrder, setLocalOrder] = React.useState<string[]>([]);
  const dragIndexRef = React.useRef<number | null>(null);
  // Snapshot of localOrder before the current drag gesture / toggle, so a
  // failed setAgentSkills mutation can revert the optimistic update instead
  // of leaving the UI showing a linkage that was never actually persisted.
  const preDragOrderRef = React.useRef<string[]>([]);

  // Derived from localOrder (not linkedLinks directly) so linkedSkills and
  // unlinkedSkills always agree on which skills are linked. During the window
  // between an optimistic toggle/reorder and the mutation resolving,
  // localOrder is ahead of the server-truth linkedLinks — deriving this from
  // linkedLinks instead would make a just-linked skill appear in BOTH lists
  // at once (and a just-unlinked skill vanish from both).
  const linkedIds = React.useMemo(() => new Set(localOrder), [localOrder]);

  // Sync local order from server when linkedLinks arrives
  React.useEffect(() => {
    if (!linkedLinks) return;
    const sorted = [...linkedLinks].sort((a, b) => a.order - b.order);
    setLocalOrder(sorted.map((l) => l.skill_id));
  }, [linkedLinks]);

  const linkedSkills: Skill[] = React.useMemo(() => {
    if (!allSkills) return [];
    return localOrder
      .map((id) => allSkills.find((s) => s.id === id))
      .filter((s): s is Skill => s !== undefined);
  }, [allSkills, localOrder]);

  const unlinkedSkills: Skill[] = React.useMemo(() => {
    if (!allSkills) return [];
    return allSkills
      .filter((s) => !linkedIds.has(s.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allSkills, linkedIds]);

  const isFiltering = filter.trim().length > 0;
  const filteredLinked = linkedSkills.filter((s) =>
    s.name.toLowerCase().includes(filter.toLowerCase()),
  );
  const filteredUnlinked = unlinkedSkills.filter((s) =>
    s.name.toLowerCase().includes(filter.toLowerCase()),
  );

  const handleToggle = (skillId: string, checked: boolean) => {
    if (setAgentSkills.isPending) return;
    const previousOrder = localOrder;
    let newOrder: string[];
    if (checked) {
      // Guard against duplicating the id — should be unreachable, since
      // unlinkedSkills is filtered to exclude anything already in
      // localOrder, but a future refactor of that derivation could silently
      // break the invariant this depends on.
      if (localOrder.includes(skillId)) return;
      newOrder = [...localOrder, skillId];
    } else {
      newOrder = localOrder.filter((id) => id !== skillId);
    }
    setLocalOrder(newOrder);
    setAgentSkills.mutate(newOrder, {
      onError: () => setLocalOrder(previousOrder),
    });
  };

  // Drag handlers for reordering linked skills
  const handleDragStart = (idx: number) => {
    // Don't start a new drag gesture while a mutation (toggle or a prior
    // drag) is still in flight — handleDragOver no-ops when dragIndexRef.current
    // stays null, so this alone blocks the whole gesture. Without this, a
    // drop could fire a second setAgentSkills mutation concurrently with the
    // first, and the two onError rollbacks would target snapshots that no
    // longer agree with each other.
    if (setAgentSkills.isPending) return;
    dragIndexRef.current = idx;
    preDragOrderRef.current = localOrder;
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    const from = dragIndexRef.current;
    // from is only ever set from a realIdx computed the same way as idx
    // (localOrder.indexOf(skill.id) in the render loop), so it should
    // always be a valid in-bounds index here — but a negative from would
    // make splice() count from the array's end and silently move the wrong
    // skill, so bounds-check defensively rather than trust the ref.
    if (from === null || from < 0 || from >= localOrder.length || from === idx) return;
    const newOrder = [...localOrder];
    const moved = newOrder.splice(from, 1)[0]!;
    newOrder.splice(idx, 0, moved);
    dragIndexRef.current = idx;
    setLocalOrder(newOrder);
  };

  const handleDragEnd = () => {
    dragIndexRef.current = null;
    // Defense in depth alongside the isPending guard in handleDragStart: if a
    // mutation somehow became pending mid-gesture, don't fire a second one.
    if (setAgentSkills.isPending) return;
    const previousOrder = preDragOrderRef.current;
    // Skip the network round-trip entirely if the drag ended back where it
    // started (picked up and dropped in the same spot) — nothing changed.
    if (localOrder.length === previousOrder.length && localOrder.every((id, i) => id === previousOrder[i])) {
      return;
    }
    // Commit the new order to the server; revert to the pre-drag order if it
    // fails so the list doesn't keep showing a reorder that was never saved.
    setAgentSkills.mutate(localOrder, {
      onError: () => setLocalOrder(previousOrder),
    });
  };

  // Keyboard/screen-reader-accessible alternative to drag-and-drop reordering
  // (native HTML5 drag has no built-in keyboard path). realIdx is the
  // skill's position in the full (unfiltered) localOrder, matching how the
  // drag handlers above already index — so this stays correct even while a
  // search filter is narrowing which rows are rendered.
  const moveLinked = (realIdx: number, direction: -1 | 1) => {
    if (setAgentSkills.isPending) return;
    // realIdx comes from localOrder.indexOf(skill.id) for a skill rendered
    // from localOrder itself, so it should never be -1 — but guard the
    // source index too, not just the target, since indexOf() returning -1
    // would otherwise swap in `undefined` and corrupt the order.
    if (realIdx < 0 || realIdx >= localOrder.length) return;
    const targetIdx = realIdx + direction;
    if (targetIdx < 0 || targetIdx >= localOrder.length) return;
    const previousOrder = localOrder;
    const newOrder = [...localOrder];
    const tmp = newOrder[realIdx]!;
    newOrder[realIdx] = newOrder[targetIdx]!;
    newOrder[targetIdx] = tmp;
    setLocalOrder(newOrder);
    setAgentSkills.mutate(newOrder, {
      onError: () => setLocalOrder(previousOrder),
    });
  };

  const pending = setAgentSkills.isPending;
  // Workspace-wide totals — used to gate the "no skills yet" empty state and
  // the footer hint, which describe the workspace, not the current filter.
  const total = allSkills?.length ?? 0;
  const linked = linkedIds.size;
  // Header count reflects what's actually visible below it, so it doesn't
  // contradict the filtered list (e.g. showing "5 of 20" while only 2 rows
  // are rendered because of an active filter).
  const visibleCount = filteredLinked.length + filteredUnlinked.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Header */}
      <div style={{ padding: "20px 24px 12px", borderBottom: "1px solid var(--border)" }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Skills</h2>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter skills…"
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
        {total > 0 && (
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8 }}>
            {filteredLinked.length} of {visibleCount} linked
          </div>
        )}
      </div>

      {/* Skill rows */}
      <div style={{ flex: 1, overflow: "auto", padding: "8px 16px" }}>
        {/* Linked skills (draggable) */}
        {filteredLinked.map((skill, idx) => {
          const tc = TYPE_COLORS[skill.type] ?? TYPE_COLORS.custom;
          const realIdx = localOrder.indexOf(skill.id);
          return (
            <div
              key={skill.id}
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
              <Checkbox
                checked={true}
                onChange={() => handleToggle(skill.id, false)}
              />
              <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>
                {skill.name}
              </span>
              <Badge color={tc.color} bg={tc.bg}>{skill.type}</Badge>
              {/* Keyboard/screen-reader-accessible alternative to drag reordering.
                  Disabled while filtering: realIdx/boundary checks are against the
                  full unfiltered localOrder, so "move up/down" would swap with a
                  neighbor hidden by the filter — invisible and confusing. Clear
                  the filter to reorder. */}
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <button
                  type="button"
                  aria-label={`Move ${skill.name} up`}
                  title={isFiltering ? "Clear the filter to reorder" : undefined}
                  onClick={() => moveLinked(realIdx, -1)}
                  disabled={pending || isFiltering || realIdx === 0}
                  style={moveButtonStyle(pending || isFiltering || realIdx === 0)}
                >
                  <Icon.ArrowUp size={12} />
                </button>
                <button
                  type="button"
                  aria-label={`Move ${skill.name} down`}
                  title={isFiltering ? "Clear the filter to reorder" : undefined}
                  onClick={() => moveLinked(realIdx, 1)}
                  disabled={pending || isFiltering || realIdx === localOrder.length - 1}
                  style={moveButtonStyle(pending || isFiltering || realIdx === localOrder.length - 1)}
                >
                  <Icon.ArrowDown size={12} />
                </button>
              </div>
            </div>
          );
        })}

        {/* Unlinked skills */}
        {filteredUnlinked.map((skill) => {
          const tc = TYPE_COLORS[skill.type] ?? TYPE_COLORS.custom;
          return (
            <div
              key={skill.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 8px",
                borderRadius: 8,
                marginBottom: 2,
                opacity: pending ? 0.6 : 1,
              }}
            >
              <Icon.GripVertical size={16} style={{ color: "transparent", flexShrink: 0 }} />
              <Checkbox
                checked={false}
                onChange={() => handleToggle(skill.id, true)}
              />
              <span style={{ flex: 1, fontSize: 14, color: "var(--text-secondary)" }}>
                {skill.name}
              </span>
              <Badge color={tc.color} bg={tc.bg}>{skill.type}</Badge>
            </div>
          );
        })}

        {total === 0 && (
          <div style={{ padding: "32px 0", textAlign: "center", fontSize: 14, color: "var(--text-muted)" }}>
            No skills in this workspace yet.{" "}
            <Link href="/skills" style={{ color: "var(--accent-text)" }}>Create one first.</Link>
          </div>
        )}
      </div>

      {/* Footer hint */}
      {linked > 0 && (
        <div style={{ padding: "10px 24px", borderTop: "1px solid var(--border)", fontSize: 12, color: "var(--text-muted)" }}>
          Order matters — earlier skills appear earlier in the assembled prompt. Drag to reorder, or use the arrow buttons.
        </div>
      )}
    </div>
  );
}
