"use client";

import React from "react";
import { Drawer, Tabs, FormField, TextInput, Textarea, Button } from "@devdigest/ui";
import { useImportSkill } from "../../../../lib/hooks/skills";
import { useToast } from "../../../../lib/toast";

type DrawerTab = "file" | "url" | "community";

const TABS = [
  { key: "file", label: "From file" },
  { key: "url", label: "From URL" },
  { key: "community", label: "Community" },
];

export function AddSkillDrawer({
  initialTab = "file",
  onClose,
  onImported,
}: {
  initialTab?: DrawerTab;
  onClose: () => void;
  onImported?: (skillId: string) => void;
}) {
  const [tab, setTab] = React.useState<DrawerTab>(initialTab);
  const importSkill = useImportSkill();
  const toast = useToast();

  // File tab state
  const [fileName, setFileName] = React.useState("");
  const [fileBody, setFileBody] = React.useState("");

  // URL tab state
  const [urlName, setUrlName] = React.useState("");
  const [url, setUrl] = React.useState("");

  const reset = () => {
    setFileName("");
    setFileBody("");
    setUrlName("");
    setUrl("");
  };

  const handleFileImport = () => {
    if (!fileBody.trim()) return;
    importSkill.mutate(
      { markdown: fileBody, name: fileName.trim() || undefined },
      {
        onSuccess: (skill) => {
          toast.success(`Imported "${skill.name}" (stored as untrusted data).`);
          reset();
          onImported?.(skill.id);
          onClose();
        },
      },
    );
  };

  const handleUrlImport = () => {
    if (!url.trim()) return;
    importSkill.mutate(
      { url: url.trim(), name: urlName.trim() || undefined },
      {
        onSuccess: (skill) => {
          toast.success(`Imported "${skill.name}". Disabled until you vet + enable it.`);
          reset();
          onImported?.(skill.id);
          onClose();
        },
      },
    );
  };

  return (
    <Drawer title="Add a skill" subtitle="Import from a file, a URL, or search vetted community skills" onClose={onClose} width={640}>
      <Tabs tabs={TABS} value={tab} onChange={(k) => setTab(k as DrawerTab)} pad="0" />

      <div style={{ paddingTop: 24 }}>
        {tab === "file" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <FormField label="Skill name" hint="Optional — derived from the first heading if blank.">
              <TextInput value={fileName} onChange={setFileName} placeholder="pr-quality-rubric" />
            </FormField>
            <FormField
              label="Skill body (Markdown)"
              hint="Pasted content is wrapped as untrusted data — never executed as instructions."
            >
              <Textarea
                value={fileBody}
                onChange={setFileBody}
                rows={14}
                mono
                placeholder={"# Rule\nDescribe the rule…"}
              />
            </FormField>
            <Button
              kind="primary"
              onClick={handleFileImport}
              disabled={!fileBody.trim() || importSkill.isPending}
            >
              {importSkill.isPending ? "Importing…" : "Import skill"}
            </Button>
          </div>
        )}

        {tab === "url" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <FormField
              label="Skill URL"
              hint="Fetched server-side, stored as untrusted, and left disabled until vetted."
            >
              <TextInput value={url} onChange={setUrl} placeholder="https://example.com/skills/security.md" />
            </FormField>
            <FormField label="Skill name" hint="Optional — derived from the first heading if blank.">
              <TextInput value={urlName} onChange={setUrlName} placeholder="security-rubric" />
            </FormField>
            <Button
              kind="primary"
              onClick={handleUrlImport}
              disabled={!url.trim() || importSkill.isPending}
            >
              {importSkill.isPending ? "Fetching…" : "Import from URL"}
            </Button>
          </div>
        )}

        {tab === "community" && (
          <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--text-muted)", fontSize: 14 }}>
            Community skill catalog coming soon.
          </div>
        )}
      </div>
    </Drawer>
  );
}
