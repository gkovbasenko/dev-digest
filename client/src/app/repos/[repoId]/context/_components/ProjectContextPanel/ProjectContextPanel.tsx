"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Skeleton, EmptyState, ErrorState, Badge, Markdown } from "@devdigest/ui";
import type { ContextBadge } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useContextDocs, useContextFilePreview } from "@/lib/hooks/context";
import { s } from "./styles";

export function ProjectContextPanel({ repoId }: { repoId: string }) {
  const t = useTranslations("context");
  const { data, isLoading, isError, error, refetch } = useContextDocs(repoId);
  const [selectedPath, setSelectedPath] = React.useState<string | null>(null);

  const documents = data?.documents ?? [];
  const selected = documents.find((d) => d.path === selectedPath) ?? null;
  const preview = useContextFilePreview(repoId, selected ? selectedPath : null);

  const badgeLabel = (badge: ContextBadge) => t(`badge.${badge}`);

  if (isLoading) {
    return (
      <div style={s.list}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} height={44} />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorState
        title={t("loadError")}
        body={error instanceof ApiError ? error.message : "Something went wrong."}
        onRetry={() => refetch()}
      />
    );
  }

  if (!data || !data.indexed) {
    return (
      <EmptyState icon="Folder" title={t("notIndexed.title")} body={t("notIndexed.body")} />
    );
  }

  if (documents.length === 0) {
    return <EmptyState icon="Folder" title={t("empty.title")} body={t("empty.body")} />;
  }

  return (
    <div>
      <div style={s.layout}>
        <div style={s.list} role="list">
          {documents.map((doc) => (
            <li key={doc.path} role="listitem" style={s.rowItem}>
              <button
                type="button"
                style={s.row(doc.path === selectedPath)}
                onClick={() => setSelectedPath(doc.path)}
              >
                <span style={s.rowPath} className="mono">
                  {doc.path}
                </span>
                <Badge>{badgeLabel(doc.badge)}</Badge>
                <span style={s.rowTokens}>{t("tokens", { count: doc.token_count })}</span>
              </button>
            </li>
          ))}
        </div>

        {selected && (
          <div style={s.preview}>
            <div style={s.previewHeader}>
              <span style={s.previewPath} className="mono">
                {selected.path}
              </span>
              <Badge>{badgeLabel(selected.badge)}</Badge>
            </div>
            {preview.isLoading ? (
              <Skeleton height={120} />
            ) : preview.isError ? (
              <ErrorState
                title={t("preview.loadError")}
                body={preview.error instanceof ApiError ? preview.error.message : "Something went wrong."}
                onRetry={() => preview.refetch()}
              />
            ) : (
              <Markdown>{preview.data?.content ?? ""}</Markdown>
            )}
          </div>
        )}
      </div>

      <div style={s.footer}>{t("indexedFooter", { count: documents.length })}</div>
    </div>
  );
}
