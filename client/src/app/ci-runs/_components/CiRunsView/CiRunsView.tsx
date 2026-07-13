/* CiRunsView — the /ci-runs page (AC-25/26/27). One row per ingested `ci_runs`
   row across the workspace: PR · repo · agent · status · findings · cost ·
   duration · a link to the Actions job. Empty state prompts adding an agent to
   CI (AC-26); null cost/duration render as an em-dash (AC-27). Built with
   layout primitives — there is no Table primitive (mirrors RecentRunsTable). */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, MonoLink } from "@devdigest/ui";
import { useCiRuns, useRefreshCiRuns } from "@/lib/hooks/ci";
import { fmtCost, fmtDuration, repoFromUrl, statusLabel } from "./helpers";
import { s } from "./styles";

export function CiRunsView() {
  const t = useTranslations("ci");
  const router = useRouter();
  const { data: runs } = useCiRuns();
  const refresh = useRefreshCiRuns();
  const runList = runs ?? [];

  return (
    <div style={s.wrap}>
      <div style={s.head}>
        <div>
          <h1 style={s.title}>{t("runs.title")}</h1>
          <div style={s.subtitle}>{t("runs.subtitle")}</div>
        </div>
        <Button kind="secondary" loading={refresh.isPending} onClick={() => refresh.mutate()}>
          {refresh.isPending ? t("runs.refreshing") : t("runs.refresh")}
        </Button>
      </div>

      {runList.length === 0 ? (
        <div style={s.tableCard}>
          <EmptyState
            icon="Workflow"
            title={t("runs.emptyTitle")}
            body={t("runs.emptyBody")}
            cta={t("ciTab.addToCi")}
            onCta={() => router.push("/agents")}
          />
        </div>
      ) : (
        <div style={s.tableCard}>
          <div style={s.headRow}>
            <span>{t("runs.table.pullRequest")}</span>
            <span>{t("runs.table.repo")}</span>
            <span>{t("runs.table.agent")}</span>
            <span>{t("runs.table.status")}</span>
            <span style={s.headCell}>{t("runs.table.findings")}</span>
            <span style={s.headCell}>{t("runs.table.cost")}</span>
            <span style={s.headCell}>{t("runs.table.duration")}</span>
            <span />
          </div>
          {runList.map((r) => (
            <div key={r.id} style={s.row}>
              <span style={s.mono}>{r.pr_number != null ? `#${r.pr_number}` : "—"}</span>
              <span style={s.mono}>{repoFromUrl(r.github_url) ?? "—"}</span>
              <span>{r.agent ?? "—"}</span>
              <span>{statusLabel(t, r.status)}</span>
              <span style={s.cell}>{r.findings_count ?? 0}</span>
              <span style={s.cell}>{fmtCost(r.cost_usd)}</span>
              <span style={s.cell}>{fmtDuration(r.duration_s)}</span>
              <span style={s.cell}>
                {r.github_url ? <MonoLink href={r.github_url}>{t("runs.view")}</MonoLink> : "—"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
