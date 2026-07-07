"use client";

import React from "react";
import { Badge, Button, Skeleton, EmptyState } from "@devdigest/ui";
import { useSkillVersions, useRestoreSkillVersion } from "../../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../../lib/toast";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

/** Version history for a skill (DESC by version) with a Restore action.
 *  Restoring creates a NEW version whose body equals the chosen version's
 *  body — it does not rewind the skill in place. */
export function VersionsTab({ skillId, currentVersion }: { skillId: string; currentVersion: number }) {
  const { data: versions, isLoading, isError } = useSkillVersions(skillId);
  const restore = useRestoreSkillVersion();
  const toast = useToast();

  const handleRestore = (version: number) => {
    // Guard against a second click firing a concurrent restore while the
    // first is still in flight (buttons are also disabled below while
    // pending, this is defense in depth).
    if (restore.isPending) return;
    if (
      !window.confirm(
        `Restore version ${version}? This creates a new version with that body — it does not rewind in place.`,
      )
    ) {
      return;
    }
    restore.mutate(
      { id: skillId, version },
      { onSuccess: () => toast.success(`Restored version ${version} as a new version.`) },
    );
  };

  if (isLoading) {
    return (
      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 8 }}>
        <Skeleton height={44} />
        <Skeleton height={44} />
        <Skeleton height={44} />
      </div>
    );
  }

  if (isError || !versions) {
    return (
      <EmptyState
        icon="AlertTriangle"
        title="Couldn't load versions"
        body="Versions for this skill could not be loaded."
      />
    );
  }

  if (versions.length === 0) {
    return (
      <EmptyState icon="History" title="No versions yet" body="This skill has no recorded version history." />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ padding: "20px 24px 12px", borderBottom: "1px solid var(--border)" }}>
        <h2 style={{ fontSize: 16, fontWeight: 700 }}>Versions</h2>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "8px 16px" }}>
        {versions.map((v) => {
          const isCurrent = v.version === currentVersion;
          return (
            <div
              key={v.version}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 8px",
                borderRadius: 8,
                marginBottom: 2,
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
              }}
            >
              <Badge color="var(--text-muted)" bg="var(--bg-hover)">v{v.version}</Badge>
              {isCurrent && <Badge color="var(--accent-text)">current</Badge>}
              <span style={{ flex: 1, fontSize: 13, color: "var(--text-muted)" }}>{formatDate(v.created_at)}</span>
              <Button
                kind="secondary"
                size="sm"
                onClick={() => handleRestore(v.version)}
                disabled={restore.isPending || isCurrent}
              >
                Restore
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
