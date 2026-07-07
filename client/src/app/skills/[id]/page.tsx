/* /skills/:id — Skill Detail (Config · Preview · Stats · Versions tabs).
   Left skill list (mirrors SkillsView's rail) + tabbed detail. Tab state
   lives in ?tab=. Selecting a different skill in the rail navigates to its
   own /skills/:id route, guarded by the Config tab's unsaved-edit check. */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button, Dropdown, ErrorState, Skeleton, Badge } from "@devdigest/ui";
import { AppShell } from "../../../components/app-shell";
import { SkillListItem } from "../_components/SkillsView/SkillListItem";
import { AddSkillDrawer } from "../_components/SkillsView/AddSkillDrawer";
import { CreateSkillModal } from "../_components/SkillsView/CreateSkillModal";
import { SkillDetail } from "./_components/SkillDetail";
import { useSkills, useSkill } from "../../../lib/hooks/skills";
import { ApiError } from "../../../lib/api";

type DrawerMode = "file" | "url" | "community" | null;

const VALID_TABS = ["config", "preview", "stats", "versions"];

export default function SkillDetailPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { id } = params;

  const { data: skills } = useSkills();
  const { data: skill, isLoading, isError, error, refetch } = useSkill(id);

  const [drawerMode, setDrawerMode] = React.useState<DrawerMode>(null);
  const [showCreate, setShowCreate] = React.useState(false);
  // Tracks whether the Config tab (SkillPreview) currently has an unsaved
  // body edit in progress. A ref (not state) since it's only read at click
  // time and shouldn't trigger a re-render on every keystroke.
  const isDirtyRef = React.useRef(false);

  const tab = VALID_TABS.includes(search.get("tab") ?? "") ? search.get("tab")! : "config";
  // SkillDetail already guards its own tab switching against isDirtyRef
  // (via its Tabs onChange), so this just commits the URL change.
  const setTab = (t: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("tab", t);
    router.replace(`/skills/${id}?${sp.toString()}`);
  };

  // Confirm before switching to a different skill with an unsaved edit in
  // progress — same guard SkillsView used to apply for its inline preview.
  const handleSelectSkill = (skillId: string) => {
    if (skillId === id) return;
    if (isDirtyRef.current && !window.confirm("Discard unsaved changes to this skill?")) {
      return;
    }
    router.push(`/skills/${skillId}?tab=${tab}`);
  };

  const dropdownItems = [
    { label: "Create from scratch", icon: "Edit" as const, onClick: () => setShowCreate(true) },
    { label: "Import from file", icon: "FileText" as const, onClick: () => setDrawerMode("file") },
    { label: "Import from URL", icon: "Globe" as const, onClick: () => setDrawerMode("url") },
    { label: "Search community skills…", icon: "Search" as const, onClick: () => setDrawerMode("community") },
  ];

  const crumb = [
    { label: "Skills Lab" },
    { label: "Skills", href: "/skills" },
    { label: skill?.name ?? "Skill" },
  ];

  if (isError || (!isLoading && !skill)) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          fullScreen
          title="Couldn’t load this skill"
          body={error instanceof ApiError ? error.message : "The skill could not be loaded."}
          onRetry={() => refetch()}
        />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={{ display: "flex", height: "calc(100vh - 52px)" }}>
        {/* left: skill list */}
        <div
          style={{
            width: 280,
            flexShrink: 0,
            borderRight: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            background: "var(--bg-surface)",
          }}
        >
          <div style={{ padding: "16px 16px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <h1 style={{ fontSize: 18, fontWeight: 700, flex: 1 }}>Skills</h1>
              <Dropdown
                width={220}
                align="right"
                trigger={
                  <Button kind="primary" size="sm" icon="Plus">
                    Add
                  </Button>
                }
                items={dropdownItems}
              />
            </div>
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: "0 12px 12px" }}>
            {(skills ?? []).map((sk) => (
              <SkillListItem
                key={sk.id}
                skill={sk}
                active={sk.id === id}
                onClick={() => handleSelectSkill(sk.id)}
              />
            ))}
          </div>
        </div>

        {/* detail */}
        {isLoading || !skill ? (
          <div style={{ flex: 1, padding: 28, display: "flex", flexDirection: "column", gap: 16 }}>
            <Skeleton height={24} width={240} />
            <Skeleton height={200} />
          </div>
        ) : (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 28px 0", flexShrink: 0 }}>
              <h1 style={{ fontSize: 18, fontWeight: 700 }}>{skill.name}</h1>
              <Badge color="var(--text-muted)" bg="var(--bg-hover)">v{skill.version}</Badge>
              {!skill.enabled && <Badge color="var(--text-muted)">disabled</Badge>}
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
              <SkillDetail
                skill={skill}
                tab={tab}
                onTab={setTab}
                onDirtyChange={(dirty) => {
                  isDirtyRef.current = dirty;
                }}
                onDeleted={() => router.push("/skills")}
              />
            </div>
          </div>
        )}
      </div>

      {drawerMode && (
        <AddSkillDrawer
          initialTab={drawerMode}
          onClose={() => setDrawerMode(null)}
          onImported={(newId) => router.push(`/skills/${newId}`)}
        />
      )}

      {showCreate && (
        <CreateSkillModal
          onClose={() => setShowCreate(false)}
          onCreated={(newId) => router.push(`/skills/${newId}`)}
        />
      )}
    </AppShell>
  );
}
