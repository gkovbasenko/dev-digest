"use client";

import React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button, Dropdown, EmptyState, Skeleton } from "@devdigest/ui";
import { AppShell } from "../../../../components/app-shell";
import { useSkills, useSkill } from "../../../../lib/hooks/skills";
import { SkillListItem } from "./SkillListItem";
import { SkillPreview } from "./SkillPreview";
import { AddSkillDrawer } from "./AddSkillDrawer";
import { CreateSkillModal } from "./CreateSkillModal";
import { s } from "./styles";

type DrawerMode = "file" | "url" | "community" | null;

const crumb = [{ label: "Skills Lab" }, { label: "Skills" }];

export function SkillsView() {
  const search = useSearchParams();
  const router = useRouter();
  const selectedId = search.get("selected");

  const { data: skills, isLoading } = useSkills();
  const { data: selectedSkill } = useSkill(selectedId);

  const [drawerMode, setDrawerMode] = React.useState<DrawerMode>(null);
  const [showCreate, setShowCreate] = React.useState(false);
  // Tracks whether SkillPreview currently has an unsaved body edit in
  // progress. A ref (not state) since it's only read at click time and
  // shouldn't trigger a re-render of this component on every keystroke.
  const isDirtyRef = React.useRef(false);

  const setSelected = (id: string | null) => {
    const sp = new URLSearchParams(search.toString());
    if (id) sp.set("selected", id);
    else sp.delete("selected");
    router.replace(`/skills?${sp.toString()}`);
  };

  // Confirm before switching away from a skill with an unsaved edit in
  // progress — without this, clicking a different row silently discards it
  // (SkillPreview remounts fresh via its `key={selectedSkill.id}`).
  const handleSelectSkill = (id: string) => {
    if (id === selectedId) return;
    if (isDirtyRef.current && !window.confirm("Discard unsaved changes to this skill?")) {
      return;
    }
    setSelected(id);
  };

  const dropdownItems = [
    { label: "Create from scratch", icon: "Edit" as const, onClick: () => setShowCreate(true) },
    { label: "Import from file", icon: "FileText" as const, onClick: () => setDrawerMode("file") },
    { label: "Import from URL", icon: "Globe" as const, onClick: () => setDrawerMode("url") },
    { label: "Search community skills…", icon: "Search" as const, onClick: () => setDrawerMode("community") },
  ];

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        {/* Left panel */}
        <div style={s.left}>
          <div style={s.leftHeader}>
            <div style={s.leftTitle}>
              <h1 style={{ fontSize: 18, fontWeight: 700, flex: 1 }}>Skills</h1>
              <Dropdown
                width={220}
                align="right"
                trigger={
                  <Button kind="primary" size="sm" icon="Plus">
                    Add Skill
                  </Button>
                }
                items={dropdownItems}
              />
            </div>
          </div>

          <div style={s.leftList}>
            {isLoading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "8px 0" }}>
                <Skeleton height={52} />
                <Skeleton height={52} />
                <Skeleton height={52} />
              </div>
            ) : !skills?.length ? (
              <EmptyState
                icon="FileText"
                title="No skills yet"
                body="Import a skill from a file, a URL, or the community catalog."
                cta="Import from file"
                onCta={() => setDrawerMode("file")}
              />
            ) : (
              skills.map((skill) => (
                <SkillListItem
                  key={skill.id}
                  skill={skill}
                  active={skill.id === selectedId}
                  onClick={() => handleSelectSkill(skill.id)}
                />
              ))
            )}
          </div>
        </div>

        {/* Right panel */}
        <div style={s.right}>
          {selectedSkill ? (
            <SkillPreview
              key={selectedSkill.id}
              skill={selectedSkill}
              onDirtyChange={(dirty) => {
                isDirtyRef.current = dirty;
              }}
            />
          ) : (
            <EmptyState
              icon="BookOpen"
              title="Select a skill"
              body="Pick a skill on the left to preview its body."
            />
          )}
        </div>
      </div>

      {drawerMode && (
        <AddSkillDrawer
          initialTab={drawerMode}
          onClose={() => setDrawerMode(null)}
          onImported={(id) => setSelected(id)}
        />
      )}

      {showCreate && (
        <CreateSkillModal
          onClose={() => setShowCreate(false)}
          onCreated={(id) => setSelected(id)}
        />
      )}
    </AppShell>
  );
}
