"use client";

import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { ConventionsPanel } from "./_components/ConventionsPanel";

export default function ConventionsPage() {
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const repoName = activeRepo?.full_name ?? repoId;

  if (repoNotFound) {
    return (
      <AppShell crumb={[{ label: repoName, mono: true }, { label: "Conventions" }]}>
        <RepoNotFound />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={[{ label: repoName, mono: true }, { label: "Conventions" }]}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)" }}>
          Conventions
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
          Extract coding conventions this repo already follows, review the candidates, and bundle
          the ones you accept into a skill.
        </p>
      </div>
      <ConventionsPanel
        repoId={repoId}
        repoFullName={activeRepo?.full_name}
        defaultBranch={activeRepo?.default_branch}
      />
    </AppShell>
  );
}
