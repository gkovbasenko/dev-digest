/* CiTab — Agent editor "CI" tab (Export to CI, AC-28/29/30). Shows every repo
   the agent is installed in (repo · target · workflow version · latest status),
   the agent's CI-run history, an "Add to CI" button opening the ExportWizard,
   and a "Fail CI on" selector bound to `agent.ci_fail_on` (persisted via the
   existing `useUpdateAgent` — no new mutation, per the plan). Renders under
   `s.tabBody` from AgentEditor, so it owns its own header/list layout. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, SelectInput, MonoLink, Badge } from "@devdigest/ui";
import type { Agent, CiFailOn, CiRun } from "@devdigest/shared";
import { useCiInstallations, useCiRuns, useRefreshCiRuns } from "@/lib/hooks/ci";
import { useUpdateAgent } from "@/lib/hooks/agents";
import { ExportWizard } from "./_components/ExportWizard";
import { s } from "./styles";

const FAIL_ON_VALUES: CiFailOn[] = ["never", "critical", "warning", "any"];

function statusLabel(t: ReturnType<typeof useTranslations>, status: string | null): string {
  switch (status) {
    case "succeeded":
      return t("runs.status.succeeded");
    case "failed":
      return t("runs.status.failed");
    case "no_findings":
      return t("runs.status.noFindings");
    case "running":
      return t("runs.status.running");
    default:
      return status ?? "—";
  }
}

const fmtCost = (n: number | null): string => (n == null ? "—" : `$${n.toFixed(2)}`);
const fmtDuration = (sec: number | null | undefined): string => (sec == null ? "—" : `${Math.round(sec)}s`);

export function CiTab({ agent }: { agent: Agent }) {
  const t = useTranslations("ci");
  const { data: installations } = useCiInstallations(agent.id);
  const { data: runs } = useCiRuns(agent.id);
  const update = useUpdateAgent();
  const refresh = useRefreshCiRuns();
  const [wizardOpen, setWizardOpen] = React.useState(false);

  const installs = installations ?? [];
  const runList = runs ?? [];

  // Latest run per installation → drives each install row's status + version.
  const latestByInstall = React.useMemo(() => {
    const map: Record<string, CiRun> = {};
    for (const r of runList) {
      if (!r.ci_installation_id) continue;
      const cur = map[r.ci_installation_id];
      if (!cur || (r.ran_at ?? "") > (cur.ran_at ?? "")) map[r.ci_installation_id] = r;
    }
    return map;
  }, [runList]);

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <div style={s.titleRow}>
          <div>
            <h2 style={s.h2}>{t("ciTab.heading")}</h2>
            <div style={s.subtitle}>{t("ciTab.subtitle")}</div>
          </div>
          <div style={s.titleActions}>
            <label style={s.failOn}>
              <span style={s.failOnLabel}>{t("ciTab.failCiOnLabel")}</span>
              <SelectInput
                value={agent.ci_fail_on}
                onChange={(v) => update.mutate({ id: agent.id, patch: { ci_fail_on: v as CiFailOn } })}
                options={FAIL_ON_VALUES.map((v) => ({ value: v, label: v }))}
              />
            </label>
            <Button kind="secondary" loading={refresh.isPending} onClick={() => refresh.mutate()}>
              {refresh.isPending ? t("runs.refreshing") : t("runs.refresh")}
            </Button>
            <Button kind="primary" icon="GitPullRequest" onClick={() => setWizardOpen(true)}>
              {t("ciTab.addToCi")}
            </Button>
          </div>
        </div>
      </div>

      <div style={s.list}>
        <div style={s.sectionTitle}>{t("ciTab.installationsTitle")}</div>
        {installs.length === 0 ? (
          <EmptyState
            icon="Workflow"
            title={t("ciTab.noInstallations")}
            body={t("ciTab.noInstallationsBody")}
            cta={t("ciTab.addToCi")}
            onCta={() => setWizardOpen(true)}
          />
        ) : (
          <div style={s.installs}>
            {installs.map((inst) => {
              const latest = latestByInstall[inst.id];
              return (
                <div key={inst.id} style={s.installRow}>
                  <span style={s.repo}>{inst.repo}</span>
                  <Badge>{inst.target_type}</Badge>
                  <span style={s.version}>
                    {latest?.source ? t("ciTab.version", { version: latest.source }) : t("ciTab.noVersion")}
                  </span>
                  <span style={s.status}>{latest?.status ? statusLabel(t, latest.status) : "—"}</span>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ ...s.sectionTitle, marginTop: 22 }}>{t("ciTab.historyTitle")}</div>
        {runList.length === 0 ? (
          <div style={s.hint}>{t("ciTab.noRuns")}</div>
        ) : (
          <div style={s.runs}>
            {runList.map((r) => (
              <div key={r.id} style={s.runRow}>
                <span style={s.pr}>{r.pr_number != null ? `#${r.pr_number}` : "—"}</span>
                <span style={s.muted}>{r.status ? statusLabel(t, r.status) : "—"}</span>
                <span style={s.muted}>{r.findings_count ?? 0}</span>
                <span style={s.muted}>{fmtCost(r.cost_usd)}</span>
                <span style={s.muted}>{fmtDuration(r.duration_s)}</span>
                {r.github_url ? (
                  <MonoLink href={r.github_url}>{t("runs.view")}</MonoLink>
                ) : (
                  <span style={s.muted}>—</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {wizardOpen && <ExportWizard agent={agent} onClose={() => setWizardOpen(false)} />}
    </div>
  );
}
