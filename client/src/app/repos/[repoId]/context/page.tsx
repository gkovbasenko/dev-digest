"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { ProjectContextPanel } from "./_components/ProjectContextPanel";

export default function ProjectContextPage() {
  const t = useTranslations("context");
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const repoName = activeRepo?.full_name ?? repoId;

  if (repoNotFound) {
    return (
      <AppShell crumb={[{ label: repoName, mono: true }, { label: t("title") }]}>
        <RepoNotFound />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={[{ label: repoName, mono: true }, { label: t("title") }]}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)" }}>
          {t("title")}
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
          {t("description")}
        </p>
      </div>
      <ProjectContextPanel repoId={repoId} />
    </AppShell>
  );
}
