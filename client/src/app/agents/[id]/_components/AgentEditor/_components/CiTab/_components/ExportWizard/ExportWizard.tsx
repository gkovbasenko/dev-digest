/* ExportWizard — the agent CI tab's "Add to CI" flow (AC-7..12). 4 steps
   (Target → Preview → Configure → Install) driven by `ExportWizardSteps`
   (`@devdigest/ui`), rendered inside `WizardDialog` (focus-trap + Escape
   wrapper the plan calls for — `Modal` itself has neither).

   Preview calls `useExportCi` with `action:'files'` (AC-16: no GitHub write,
   so it is safe to call as soon as the user reaches this step, and re-safe on
   every subsequent visit — AC-18 upserts the same installation row rather
   than duplicating it) to get the REAL server-generated bundle, rather than
   re-implementing `ci/manifest.ts`/`workflow.ts` client-side. The workflow
   file is then held in local, independently-editable state (AC-8); those
   edits flow into the `action='files'` download (the only place they *can*
   flow into, since `CiExportInput` has no file-content override field — the
   `open_pr` path always re-serializes server-side from the agent's current
   config, by contract design). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Checkbox, MonoLink, Textarea } from "@devdigest/ui";
import { ExportWizardSteps } from "@devdigest/ui";
import type { Agent, CiExport, CiFile } from "@devdigest/shared";
import { useExportCi } from "@/lib/hooks/ci";
import { WizardDialog } from "./WizardDialog";
import {
  DEFAULT_TRIGGERS,
  EXPECTED_SECRETS,
  POST_AS_VALUES,
  STEP_CONFIGURE,
  STEP_INSTALL,
  STEP_PREVIEW,
  STEP_TARGET,
  TARGET_VALUES,
} from "./constants";
import { downloadFiles, initialWizardInput, type WizardInput } from "./helpers";
import { s } from "./styles";

const isWorkflowFile = (path: string) => path.startsWith(".github/workflows/");

export function ExportWizard({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const t = useTranslations("ci");
  const exportCi = useExportCi();

  const [step, setStep] = React.useState(STEP_TARGET);
  const [input, setInput] = React.useState<WizardInput>(initialWizardInput);
  const [files, setFiles] = React.useState<CiFile[] | null>(null);
  const [previewExport, setPreviewExport] = React.useState<CiExport | null>(null);
  const [previewKey, setPreviewKey] = React.useState<string | null>(null);
  const [installAction, setInstallAction] = React.useState<"open_pr" | "files">("open_pr");
  const [installResult, setInstallResult] = React.useState<CiExport | null>(null);
  const [filesDownloaded, setFilesDownloaded] = React.useState(false);

  // Fetch (or re-fetch on config drift) the real bundle preview whenever the
  // Preview step is reached with a repo/target/triggers/post_as combination
  // that hasn't been fetched yet this session.
  React.useEffect(() => {
    if (step !== STEP_PREVIEW || !input.repo) return;
    const key = JSON.stringify(input);
    if (key === previewKey) return;
    setPreviewKey(key);
    exportCi.mutate(
      { agentId: agent.id, ...input, action: "files" },
      {
        onSuccess: (data) => {
          setPreviewExport(data);
          setFiles(data.files);
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, input, previewKey, agent.id]);

  const updateFileContents = (path: string, contents: string) =>
    setFiles((prev) => (prev ? prev.map((f) => (f.path === path ? { ...f, contents } : f)) : prev));

  const toggleTrigger = (trigger: string) =>
    setInput((prev) => ({
      ...prev,
      triggers: prev.triggers.includes(trigger)
        ? prev.triggers.filter((tr) => tr !== trigger)
        : [...prev.triggers, trigger],
    }));

  const confirmInstall = () => {
    if (installAction === "files") {
      if (files) downloadFiles(files);
      setInstallResult(previewExport && files ? { ...previewExport, files } : previewExport);
      setFilesDownloaded(true);
      return;
    }
    exportCi.mutate(
      { agentId: agent.id, ...input, action: "open_pr" },
      { onSuccess: (data) => setInstallResult(data) },
    );
  };

  const steps = [
    t("exportWizard.steps.target"),
    t("exportWizard.steps.preview"),
    t("exportWizard.steps.configure"),
    t("exportWizard.steps.install"),
  ];

  return (
    <WizardDialog
      width={720}
      title={t("exportWizard.title")}
      ariaLabel={t("exportWizard.title")}
      subtitle={t("exportWizard.subtitle", { agentName: agent.name })}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          {step > STEP_TARGET && !installResult && (
            <Button kind="secondary" onClick={() => setStep((s0) => s0 - 1)} disabled={exportCi.isPending}>
              {t("exportWizard.back")}
            </Button>
          )}
          <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
            {installResult ? (
              <Button kind="primary" onClick={onClose}>
                {t("publishDialog.close")}
              </Button>
            ) : step < STEP_INSTALL ? (
              <Button
                kind="primary"
                onClick={() => setStep((s0) => s0 + 1)}
                disabled={step === STEP_TARGET && !input.repo.trim()}
              >
                {t("exportWizard.continue")}
              </Button>
            ) : (
              <Button
                kind="primary"
                icon={installAction === "open_pr" ? "GitPullRequest" : "Download"}
                loading={exportCi.isPending && installAction === "open_pr"}
                disabled={installAction === "files" ? !files : exportCi.isPending}
                onClick={confirmInstall}
              >
                {exportCi.isPending && installAction === "open_pr" ? t("exportWizard.installing") : t("exportWizard.install")}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div style={s.stepBar}>
        <ExportWizardSteps step={step} labels={steps} />
      </div>
      <div style={s.body}>
        {step === STEP_TARGET && (
          <TargetStep t={t} input={input} onChange={setInput} />
        )}
        {step === STEP_PREVIEW && (
          <PreviewStep
            t={t}
            files={files}
            loading={exportCi.isPending && !files}
            error={exportCi.isError}
            onEditWorkflow={updateFileContents}
          />
        )}
        {step === STEP_CONFIGURE && (
          <ConfigureStep t={t} input={input} onToggleTrigger={toggleTrigger} onChange={setInput} />
        )}
        {step === STEP_INSTALL && (
          <InstallStep
            t={t}
            action={installAction}
            onChangeAction={setInstallAction}
            repo={input.repo}
            fileCount={files?.length ?? 0}
            result={installResult}
            filesDownloaded={filesDownloaded}
            pending={exportCi.isPending}
            error={exportCi.isError}
          />
        )}
      </div>
    </WizardDialog>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Target (AC-7)
// ---------------------------------------------------------------------------

function TargetStep({
  t,
  input,
  onChange,
}: {
  t: ReturnType<typeof useTranslations>;
  input: WizardInput;
  onChange: React.Dispatch<React.SetStateAction<WizardInput>>;
}) {
  return (
    <>
      <div>
        <div style={s.sectionTitle}>{t("exportWizard.targetGroupLabel")}</div>
        <div role="radiogroup" aria-label={t("exportWizard.targetGroupLabel")} style={{ ...s.targetGrid, marginTop: 8 }}>
          {TARGET_VALUES.map((v) => (
            <label key={v} style={s.targetOption(input.target === v)}>
              <input
                type="radio"
                name="ci-target"
                value={v}
                checked={input.target === v}
                onChange={() => onChange((prev) => ({ ...prev, target: v }))}
              />
              <span>
                <div style={s.targetLabel}>
                  {t(`exportWizard.targets.${v}`)}
                  {v === "gha" && <span style={s.recommended}>{t("exportWizard.recommended")}</span>}
                </div>
                <div style={s.targetDesc}>{t(`exportWizard.targets.${v}Desc`)}</div>
              </span>
            </label>
          ))}
        </div>
      </div>
      <div>
        <div style={s.sectionTitle}>{t("exportWizard.repoLabel")}</div>
        <div style={{ marginTop: 8 }}>
          <input
            aria-label={t("exportWizard.repoLabel")}
            value={input.repo}
            placeholder={t("exportWizard.repoPlaceholder")}
            onChange={(e) => onChange((prev) => ({ ...prev, repo: e.target.value }))}
            className="mono"
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 7,
              border: "1px solid var(--border-strong)",
              background: "var(--bg-elevated)",
              color: "var(--text-primary)",
              fontSize: 14,
            }}
          />
        </div>
        <div style={{ ...s.hint, marginTop: 6 }}>{t("exportWizard.repoHint")}</div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Preview (AC-8)
// ---------------------------------------------------------------------------

function PreviewStep({
  t,
  files,
  loading,
  error,
  onEditWorkflow,
}: {
  t: ReturnType<typeof useTranslations>;
  files: CiFile[] | null;
  loading: boolean;
  error: boolean;
  onEditWorkflow: (path: string, contents: string) => void;
}) {
  if (loading) return <div style={s.hint}>{t("exportWizard.generating")}</div>;
  if (error) return <div style={s.error}>{t("exportWizard.previewError")}</div>;
  if (!files || files.length === 0) return <div style={s.hint}>{t("exportWizard.generating")}</div>;

  const workflow = files.find((f) => isWorkflowFile(f.path));
  const rest = files.filter((f) => !isWorkflowFile(f.path));

  return (
    <>
      <div>
        <div style={s.sectionTitle}>{t("exportWizard.filesToCreate")}</div>
        <div style={{ ...s.fileList, marginTop: 8 }}>
          {rest.map((f) => (
            <div key={f.path} style={s.fileRow}>
              <span style={s.filePath}>{f.path}</span>
              {f.editable && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{t("exportWizard.editable")}</span>}
            </div>
          ))}
        </div>
      </div>
      {workflow && (
        <div>
          <div style={s.sectionTitle}>{workflow.path}</div>
          <Textarea
            value={workflow.contents}
            onChange={(v) => onEditWorkflow(workflow.path, v)}
            rows={12}
            mono
          />
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Configure (AC-9/AC-10)
// ---------------------------------------------------------------------------

function ConfigureStep({
  t,
  input,
  onToggleTrigger,
  onChange,
}: {
  t: ReturnType<typeof useTranslations>;
  input: WizardInput;
  onToggleTrigger: (trigger: string) => void;
  onChange: React.Dispatch<React.SetStateAction<WizardInput>>;
}) {
  return (
    <>
      <div>
        <div style={s.sectionTitle}>{t("exportWizard.triggerLabel")}</div>
        <div style={{ ...s.triggerRow, marginTop: 8 }}>
          <Checkbox checked label={t("exportWizard.triggers.opened")} />
          <Checkbox checked label={t("exportWizard.triggers.synchronize")} />
          <Checkbox
            checked={input.triggers.includes("reopened")}
            onChange={() => onToggleTrigger("reopened")}
            label={t("exportWizard.triggers.reopened")}
          />
        </div>
      </div>

      <div>
        <div style={s.sectionTitle}>{t("exportWizard.postResultsLabel")}</div>
        <div role="radiogroup" aria-label={t("exportWizard.postResultsLabel")} style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
          {POST_AS_VALUES.map((v) => (
            <label key={v} style={s.targetOption(input.post_as === v)}>
              <input
                type="radio"
                name="ci-post-as"
                value={v}
                checked={input.post_as === v}
                onChange={() => onChange((prev) => ({ ...prev, post_as: v }))}
              />
              <span>
                <div style={s.targetLabel}>{t(`exportWizard.postAs.${camel(v)}`)}</div>
                {v === "github_review" && <div style={s.targetDesc}>{t("exportWizard.postAsHint")}</div>}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <div style={s.sectionTitle}>{t("exportWizard.secretsLabel")}</div>
        <div style={{ ...s.fileList, marginTop: 8 }}>
          {EXPECTED_SECRETS.map((name) => (
            <div key={name} style={s.secretRow}>
              <span className="mono">{name}</span>
              <span style={s.secretStatus}>
                {name === "GITHUB_TOKEN" ? t("exportWizard.secretAuto") : t("exportWizard.secretNotSet")}
              </span>
            </div>
          ))}
        </div>
        <div style={{ ...s.hint, marginTop: 6 }}>{t("exportWizard.secretNote", { key: "OPENROUTER_API_KEY" })}</div>
      </div>

      <div>
        <div style={s.sectionTitle}>{t("exportWizard.blockMergeTitle")}</div>
        <div style={s.hint}>{t("exportWizard.blockMergeDesc")}</div>
      </div>
    </>
  );
}

function camel(v: string): string {
  return v.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Step 4 — Install (AC-11)
// ---------------------------------------------------------------------------

function InstallStep({
  t,
  action,
  onChangeAction,
  repo,
  fileCount,
  result,
  filesDownloaded,
  pending,
  error,
}: {
  t: ReturnType<typeof useTranslations>;
  action: "open_pr" | "files";
  onChangeAction: (a: "open_pr" | "files") => void;
  repo: string;
  fileCount: number;
  result: CiExport | null;
  filesDownloaded: boolean;
  pending: boolean;
  error: boolean;
}) {
  if (result) {
    return (
      <div style={s.fileList}>
        {result.pr_url ? (
          <div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>{t("publishDialog.doneTitle")}</div>
            <MonoLink href={result.pr_url}>{t("publishDialog.openPr")}</MonoLink>
          </div>
        ) : (
          filesDownloaded && <div style={{ fontWeight: 600 }}>{t("exportWizard.filesDownloaded", { count: fileCount })}</div>
        )}
      </div>
    );
  }

  return (
    <>
      <div role="radiogroup" aria-label={t("exportWizard.install")} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <label style={s.installOption(action === "open_pr")}>
          <input
            type="radio"
            name="ci-install-action"
            value="open_pr"
            checked={action === "open_pr"}
            onChange={() => onChangeAction("open_pr")}
          />
          <span>
            <div style={s.targetLabel}>
              {t("exportWizard.installCardTitle")}
              <span style={s.recommended}>{t("exportWizard.recommended")}</span>
            </div>
            <div style={s.targetDesc}>{t("exportWizard.installCardBody", { repo, count: fileCount })}</div>
          </span>
        </label>
        <label style={s.installOption(action === "files")}>
          <input
            type="radio"
            name="ci-install-action"
            value="files"
            checked={action === "files"}
            onChange={() => onChangeAction("files")}
          />
          <span>
            <div style={s.targetLabel}>{t("exportWizard.filesOptionTitle")}</div>
            <div style={s.targetDesc}>{t("exportWizard.filesOptionBody")}</div>
          </span>
        </label>
      </div>
      {error && <div style={s.error}>{t("exportWizard.installError")}</div>}
    </>
  );
}
