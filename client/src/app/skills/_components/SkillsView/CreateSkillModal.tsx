"use client";

import React from "react";
import { Modal, FormField, TextInput, SelectInput, Textarea, Button } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { useCreateSkill } from "../../../../lib/hooks/skills";
import { useToast } from "../../../../lib/toast";

const TYPE_OPTIONS: { value: SkillType; label: string }[] = [
  { value: "rubric", label: "Rubric" },
  { value: "convention", label: "Convention" },
  { value: "security", label: "Security" },
  { value: "custom", label: "Custom" },
];

export function CreateSkillModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated?: (skillId: string) => void;
}) {
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<SkillType>("custom");
  const [description, setDescription] = React.useState("");
  const [body, setBody] = React.useState("");
  const create = useCreateSkill();
  const toast = useToast();

  const handleCreate = () => {
    if (!name.trim() || !body.trim()) return;
    create.mutate(
      { name: name.trim(), type, description: description.trim(), body: body.trim() },
      {
        onSuccess: (skill) => {
          toast.success(`Skill "${skill.name}" created.`);
          onCreated?.(skill.id);
          onClose();
        },
      },
    );
  };

  return (
    <Modal
      title="Create skill"
      subtitle="An agent skill is a focused review rule — a rubric, convention, or security check."
      onClose={onClose}
      width={640}
      footer={
        <Button kind="primary" onClick={handleCreate} disabled={!name.trim() || !body.trim() || create.isPending}>
          {create.isPending ? "Creating…" : "Create skill"}
        </Button>
      }
    >
      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
        <FormField label="Name" required>
          <TextInput value={name} onChange={setName} placeholder="pr-quality-rubric" />
        </FormField>
        <FormField label="Type">
          <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={TYPE_OPTIONS} />
        </FormField>
        <FormField
          label="Description"
          hint="Describe what this skill checks — formulate directively (e.g. 'Detect N+1 queries in Drizzle')."
        >
          <TextInput value={description} onChange={setDescription} placeholder="Catches missing indexes on FK columns" />
        </FormField>
        <FormField label="Skill body (Markdown)" required hint="The rule text injected into the agent's prompt.">
          <Textarea
            value={body}
            onChange={setBody}
            rows={12}
            mono
            placeholder={"# Rule\nDescribe the rule…"}
          />
        </FormField>
      </div>
    </Modal>
  );
}
