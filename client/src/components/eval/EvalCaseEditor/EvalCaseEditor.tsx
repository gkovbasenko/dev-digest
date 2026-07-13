/* EvalCaseEditor — shared Modal-based editor for a single eval case (AC-20/AC-21).
   Consumed by FindingCard's "Turn into eval case" action (T5), the Agent Editor's
   Evals tab (T6, edit + create), and drives save + run-on-save. Two modes:
   - EDIT: pass `evalCase`; the frozen input (diff/files/meta) is read-only.
   - CREATE: pass `agentId` (no `evalCase`); name, input diff and expected output
     are authored by hand and POSTed to `useCreateEvalCase`. */
"use client";

import React from "react";
import { Modal, FormField, TextInput, Textarea, Tabs, Button, Toggle } from "@devdigest/ui";
import type { EvalCase, EvalCaseResult } from "@devdigest/shared";
import { useUpdateEvalCase, useCreateEvalCase, useRunEvalCase } from "@/lib/hooks/eval";
import { StatusIcon } from "../StatusIcon";
import { INPUT_TABS, type InputTabKey } from "./constants";
import { formatCost, formatDuration, formatExpectedGot, insertFindingSkeleton, stringifyExpectedOutput } from "./helpers";
import { validateExpectedOutput } from "./schema";
import { s } from "./styles";

const EMPTY_EXPECTED = { must_find: [], must_not_flag: [] };

export function EvalCaseEditor({
  evalCase,
  agentId,
  onClose,
  onSaved,
}: {
  /** Present in EDIT mode; omit (and pass `agentId`) to CREATE from scratch. */
  evalCase?: EvalCase;
  /** Owning agent, required in CREATE mode. */
  agentId?: string;
  onClose: () => void;
  onSaved?: (updated: EvalCase) => void;
}) {
  const isCreate = !evalCase;

  const [name, setName] = React.useState(evalCase?.name ?? "");
  const [expectedOutputText, setExpectedOutputText] = React.useState(() =>
    stringifyExpectedOutput(evalCase?.expected_output ?? EMPTY_EXPECTED),
  );
  const [inputDiff, setInputDiff] = React.useState(evalCase?.input_diff ?? "");
  const [inputTab, setInputTab] = React.useState<InputTabKey>("diff");
  const [runOnSave, setRunOnSave] = React.useState(false);
  const [runOutcome, setRunOutcome] = React.useState<EvalCaseResult | null>(null);

  const updateCase = useUpdateEvalCase();
  const createCase = useCreateEvalCase(agentId ?? "");
  const runCase = useRunEvalCase();

  const nameValid = name.trim().length > 0;
  const validation = React.useMemo(() => validateExpectedOutput(expectedOutputText), [expectedOutputText]);
  const saving = updateCase.isPending || createCase.isPending || runCase.isPending;
  const saveDisabled = !nameValid || !validation.valid || saving;

  const handleAddSkeleton = () => setExpectedOutputText((prev) => insertFindingSkeleton(prev));

  // Run-on-save: stay open and render the result strip in place — no navigation
  // (AC-21). Shared by both modes once the case has an id.
  const runThen = (saved: EvalCase) => {
    runCase.mutate(saved.id, {
      onSuccess: (result) => {
        setRunOutcome(result.result.case_results[0] ?? null);
        onSaved?.(saved);
      },
    });
  };

  const afterSave = (saved: EvalCase) => {
    if (!runOnSave) {
      onSaved?.(saved);
      onClose();
      return;
    }
    runThen(saved);
  };

  const handleSave = () => {
    if (saveDisabled || !validation.valid) return;
    setRunOutcome(null);
    if (isCreate) {
      createCase.mutate(
        { name: name.trim(), input_diff: inputDiff, expected_output: validation.value },
        { onSuccess: afterSave },
      );
      return;
    }
    updateCase.mutate(
      { id: evalCase.id, patch: { name: name.trim(), expected_output: validation.value } },
      { onSuccess: afterSave },
    );
  };

  const saveLabel = runCase.isPending
    ? "Running…"
    : createCase.isPending
      ? "Creating…"
      : updateCase.isPending
        ? "Saving…"
        : isCreate
          ? "Create"
          : "Save";

  return (
    <Modal
      title={isCreate ? "New eval case" : "Edit eval case"}
      subtitle={evalCase?.name}
      onClose={onClose}
      width={720}
      footer={
        <div style={s.footer}>
          <label style={s.runOnSaveLabel}>
            Run on save
            <Toggle on={runOnSave} onChange={setRunOnSave} size={16} />
          </label>
          <Button kind="primary" onClick={handleSave} disabled={saveDisabled} loading={saving}>
            {saveLabel}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <FormField label="Name" required>
          <TextInput value={name} onChange={setName} placeholder="e.g. missing-index-on-fk" />
        </FormField>

        {isCreate ? (
          <FormField label="Input diff" hint="Frozen at save — the run replays this text verbatim.">
            <Textarea
              value={inputDiff}
              onChange={setInputDiff}
              rows={10}
              mono
              placeholder={"diff --git a/src/foo.ts b/src/foo.ts\n@@ ... @@"}
            />
          </FormField>
        ) : (
          <FormField label="Input (frozen)">
            <Tabs tabs={[...INPUT_TABS]} value={inputTab} onChange={(k) => setInputTab(k as InputTabKey)} pad="0" />
            <div style={s.inputPane}>
              {inputTab === "diff" && <pre style={s.pre}>{evalCase.input_diff || "(no diff)"}</pre>}
              {inputTab === "files" && <pre style={s.pre}>{JSON.stringify(evalCase.input_files ?? [], null, 2)}</pre>}
              {inputTab === "meta" && <pre style={s.pre}>{JSON.stringify(evalCase.input_meta ?? {}, null, 2)}</pre>}
            </div>
          </FormField>
        )}

        <FormField
          label="Expected output"
          required
          right={
            <Button kind="tertiary" size="sm" onClick={handleAddSkeleton}>
              + Finding skeleton
            </Button>
          }
          hint={
            <span style={s.validity(validation.valid)}>
              {validation.valid ? "Valid" : `Invalid — ${validation.error}`}
            </span>
          }
        >
          <Textarea value={expectedOutputText} onChange={setExpectedOutputText} rows={12} mono />
        </FormField>

        {runOutcome && (
          <div role="status" style={s.resultStrip(runOutcome.pass)}>
            <StatusIcon status={runOutcome.pass ? "pass" : "fail"} />
            <span>{formatExpectedGot(runOutcome.expected, runOutcome.got)}</span>
            <span>·</span>
            <span>{formatDuration(runOutcome.duration_ms)}</span>
            <span>·</span>
            <span>{formatCost(runOutcome.cost_usd)}</span>
          </div>
        )}
      </div>
    </Modal>
  );
}
