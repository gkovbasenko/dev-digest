"use client";

import React from "react";
import { Skeleton, EmptyState, ErrorState, Button } from "@devdigest/ui";
import { ApiError } from "@/lib/api";
import {
  useConventions,
  useExtractConventions,
  useConventionAction,
} from "@/lib/hooks/conventions";
import { ConventionCandidateCard } from "../ConventionCandidateCard";
import { BundleSkillModal } from "../BundleSkillModal";
import { s } from "./styles";

export function ConventionsPanel({
  repoId,
  repoFullName,
  defaultBranch,
}: {
  repoId: string;
  repoFullName?: string | null;
  defaultBranch?: string | null;
}) {
  const { data: conventions, isLoading, isError, error, refetch } = useConventions(repoId);
  const extract = useExtractConventions(repoId);
  const action = useConventionAction();
  const [showBundle, setShowBundle] = React.useState(false);

  const acceptedCount = (conventions ?? []).filter((c) => c.accepted).length;

  return (
    <div>
      <div style={s.toolbar}>
        <div style={s.toolbarLeft}>
          <span style={s.count}>
            {conventions ? `${conventions.length} candidate(s), ${acceptedCount} accepted` : ""}
          </span>
        </div>
        <div style={s.toolbarLeft}>
          <Button
            kind="secondary"
            size="sm"
            icon="Sparkles"
            loading={extract.isPending}
            onClick={() => extract.mutate()}
          >
            {extract.isPending ? "Extracting…" : "Extract conventions"}
          </Button>
          <Button
            kind="primary"
            size="sm"
            disabled={acceptedCount === 0}
            onClick={() => setShowBundle(true)}
          >
            Create skill from accepted
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div style={s.list}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height={72} />
          ))}
        </div>
      ) : isError ? (
        <ErrorState
          title="Could not load conventions"
          body={error instanceof ApiError ? error.message : "Something went wrong."}
          onRetry={() => refetch()}
        />
      ) : !conventions || conventions.length === 0 ? (
        <EmptyState
          icon="Sparkles"
          title="No conventions extracted yet"
          body="Run an extraction to have a model propose coding conventions from this repo's source and config files."
        />
      ) : (
        <div style={s.list}>
          {conventions.map((c) => (
            <ConventionCandidateCard
              key={c.id}
              c={c}
              pending={action.isPending}
              repoFullName={repoFullName}
              defaultBranch={defaultBranch}
              onAction={(patch) => action.mutate({ id: c.id, repoId, patch })}
            />
          ))}
        </div>
      )}

      {showBundle && <BundleSkillModal repoId={repoId} onClose={() => setShowBundle(false)} />}
    </div>
  );
}
