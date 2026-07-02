"use client";

import React from "react";
import { Modal, FormField, TextInput, SelectInput, Textarea, Button, Skeleton, Icon } from "@devdigest/ui";
import { useAgents } from "@/lib/hooks/agents";
import { useAgentSkills, useSetAgentSkills } from "@/lib/hooks/skills";
import { useCreateSkill } from "@/lib/hooks/skills";
import { useBundleConventions } from "@/lib/hooks/conventions";
import { useToast } from "@/lib/toast";

export function BundleSkillModal({
  repoId,
  repoFullName,
  acceptedCount,
  onClose,
}: {
  repoId: string;
  repoFullName?: string | null;
  acceptedCount?: number;
  onClose: () => void;
}) {
  const bundle = useBundleConventions(repoId);
  const { data: agents } = useAgents();
  const create = useCreateSkill();
  const toast = useToast();

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [body, setBody] = React.useState("");
  const [agentId, setAgentId] = React.useState<string>("");

  const agentSkills = useAgentSkills(agentId || undefined);
  const setAgentSkills = useSetAgentSkills(agentId);

  const bundleMutate = bundle.mutate;
  React.useEffect(() => {
    bundleMutate(undefined, {
      onSuccess: (result) => {
        setName(result.name);
        setDescription(result.description);
        setBody(result.body);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const agentOptions = (agents ?? []).map((a) => ({ value: a.id, label: a.name }));

  const handleCreate = () => {
    if (!name.trim() || !body.trim()) return;
    create.mutate(
      { name: name.trim(), type: "convention", description: description.trim(), body: body.trim() },
      {
        onSuccess: (skill) => {
          if (!agentId) {
            toast.success(`Skill "${skill.name}" created.`);
            onClose();
            return;
          }
          const currentIds = (agentSkills.data ?? []).map((l) => l.skill_id);
          setAgentSkills.mutate([...currentIds, skill.id], {
            onSuccess: () => {
              toast.success(`Skill "${skill.name}" created and linked to the agent.`);
              onClose();
            },
          });
        },
      },
    );
  };

  const pending = create.isPending || setAgentSkills.isPending;
  const loadingBundle = bundle.isPending && !bundle.data;

  const mergedFrom =
    acceptedCount != null
      ? `Merged from ${acceptedCount} accepted convention${acceptedCount === 1 ? "" : "s"}${
          repoFullName ? ` in ${repoFullName}` : ""
        }. Everything below is editable before you save.`
      : null;

  return (
    <Modal
      title="Create skill from conventions"
      subtitle={name || undefined}
      onClose={onClose}
      width={640}
      footer={
        <Button
          kind="primary"
          onClick={handleCreate}
          disabled={!name.trim() || !body.trim() || pending || loadingBundle}
        >
          {pending ? "Saving…" : "Create skill"}
        </Button>
      }
    >
      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
        {loadingBundle ? (
          <Skeleton height={200} />
        ) : (
          <>
            {mergedFrom && (
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "10px 12px",
                  borderRadius: 7,
                  background: "var(--info-bg)",
                  color: "var(--info)",
                  fontSize: 13,
                  lineHeight: 1.5,
                }}
              >
                <Icon.Info size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{mergedFrom}</span>
              </div>
            )}
            <FormField label="Name" required>
              <TextInput value={name} onChange={setName} placeholder="repo-conventions" />
            </FormField>
            <FormField label="Description">
              <TextInput value={description} onChange={setDescription} placeholder="Coding conventions extracted from this repository." />
            </FormField>
            <FormField label="Skill body (Markdown)" required>
              <Textarea value={body} onChange={setBody} rows={14} mono />
            </FormField>
            <FormField label="Link to agent" hint="Optional — appends this skill to the agent's existing linked skills.">
              <SelectInput
                value={agentId}
                onChange={setAgentId}
                options={[{ value: "", label: "Don't link" }, ...agentOptions]}
              />
            </FormField>
          </>
        )}
      </div>
    </Modal>
  );
}
