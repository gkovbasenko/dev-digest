/* BlastPanel — pure read over the pre-built repo-intel index: changed symbols,
   who calls them (grouped by symbol), affected HTTP endpoints/crons, plus
   counts. GET /pulls/:id/blast is free/deterministic (no LLM). When the index
   is missing/partial we show an honest degraded badge with an explanation —
   never a blank screen. The Tree view is the real map; Graph is a labeled
   placeholder (full graph rendering is a follow-up). At the bottom, a
   collapsible "Prior PRs touching these files" accordion (T5) reads
   GET /pulls/:id/prior-prs — other merged PRs whose persisted files overlap
   this PR's changed files — and links each row to that PR's detail page. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Icon, SectionLabel, Badge, Button, MonoLink, EmptyState } from "@devdigest/ui";
import { useBlast, usePriorPrs } from "@/lib/hooks/blast";
import { githubBlobUrl } from "@/lib/github-urls";
import type { DownstreamImpact, PrHistoryItem } from "@/lib/types";
import { s } from "./styles";

type ViewMode = "tree" | "graph";

/** Color the "METHOD /path" endpoint chip by HTTP method. */
const METHOD_COLOR: Record<string, string> = {
  GET: "var(--ok)",
  POST: "var(--accent)",
  PUT: "var(--warn)",
  PATCH: "var(--warn)",
  DELETE: "var(--crit)",
};

/** Split a "METHOD /path" string into its parts; tolerates a bare path with
    no method prefix. */
function parseEndpoint(endpoint: string): { method: string; path: string } {
  const idx = endpoint.indexOf(" ");
  if (idx === -1) return { method: "", path: endpoint };
  return { method: endpoint.slice(0, idx), path: endpoint.slice(idx + 1) };
}

/** One compact inline metric — icon, count, label — in the panel header row. */
function Metric({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <span style={s.metric}>
      {icon}
      <span className="tnum" style={s.metricValue}>
        {value}
      </span>
      <span style={s.metricLabel}>{label}</span>
    </span>
  );
}

function EndpointChip({ endpoint }: { endpoint: string }) {
  const { method, path } = parseEndpoint(endpoint);
  const color = METHOD_COLOR[method] ?? "var(--text-muted)";
  return (
    <Badge icon="Link" color={color} mono>
      {method ? `${method} ${path}` : path}
    </Badge>
  );
}

function CronChip({ cron }: { cron: string }) {
  return (
    <Badge icon="Clock" color="var(--text-muted)" mono>
      {cron}
    </Badge>
  );
}

function SymbolBlock({
  impact,
  repoFullName,
  headSha,
}: {
  impact: DownstreamImpact;
  repoFullName: string | null;
  headSha: string | null | undefined;
}) {
  const t = useTranslations("prReview");
  const [open, setOpen] = React.useState(true);
  const hasChips = impact.endpoints_affected.length > 0 || impact.crons_affected.length > 0;

  return (
    <div style={s.symbolBlock}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setOpen((o) => !o);
        }}
        style={s.symbolHeader}
        aria-expanded={open}
      >
        <Icon.ChevronDown
          size={14}
          style={{
            transform: open ? "none" : "rotate(-90deg)",
            transition: "transform .12s",
            color: "var(--text-muted)",
          }}
        />
        <span className="mono" style={s.symbolName}>
          {impact.symbol}
        </span>
        <Badge>{t("blast.callersCount", { count: impact.callers.length })}</Badge>
      </div>
      {open && (
        <div style={s.symbolBody}>
          {impact.callers.length > 0 && (
            <div style={s.callerList}>
              {impact.callers.map((c, i) => {
                const href =
                  repoFullName && headSha
                    ? githubBlobUrl(repoFullName, headSha, c.file, c.line)
                    : undefined;
                return (
                  <div key={`${c.file}:${c.line}:${i}`} style={s.callerRow}>
                    <MonoLink href={href}>
                      {c.file}:{c.line}
                    </MonoLink>
                    <span style={s.callerName}>{c.name}</span>
                  </div>
                );
              })}
            </div>
          )}
          {hasChips && (
            <div style={s.chipRow}>
              {impact.endpoints_affected.map((e) => (
                <EndpointChip key={e} endpoint={e} />
              ))}
              {impact.crons_affected.map((c) => (
                <CronChip key={c} cron={c} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PriorPrRow({ item, repoId }: { item: PrHistoryItem; repoId: string }) {
  const t = useTranslations("prReview");
  return (
    <div style={s.priorPrRow}>
      <Link href={`/repos/${repoId}/pulls/${item.pr_number}`} style={{ display: "flex", flex: 1, gap: 10, alignItems: "center", minWidth: 0 }}>
        <span className="mono" style={s.priorPrNumber}>
          #{item.pr_number}
        </span>
        <span style={s.priorPrTitle}>{item.title}</span>
      </Link>
      <span style={s.priorPrAuthor}>{item.author}</span>
      <Badge mono>{t("blast.priorPrs.filesOverlap", { count: item.files_overlap.length })}</Badge>
    </div>
  );
}

function PriorPrsAccordion({ prId, repoId }: { prId: string | null; repoId: string }) {
  const t = useTranslations("prReview");
  const [open, setOpen] = React.useState(false);
  const { data } = usePriorPrs(prId);
  const history = data?.history ?? [];

  return (
    <div style={s.priorPrsBlock}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setOpen((o) => !o);
        }}
        style={s.priorPrsHeader}
        aria-expanded={open}
      >
        <Icon.ChevronDown
          size={14}
          style={{
            transform: open ? "none" : "rotate(-90deg)",
            transition: "transform .12s",
            color: "var(--text-muted)",
          }}
        />
        <span style={s.priorPrsTitle}>{t("blast.priorPrs.title")}</span>
        <Badge>{t("blast.priorPrs.count", { count: history.length })}</Badge>
      </div>
      {open && (
        <div style={s.priorPrsBody}>
          {history.length > 0 ? (
            history.map((item) => (
              <PriorPrRow key={item.pr_number} item={item} repoId={repoId} />
            ))
          ) : (
            <div style={s.priorPrsEmpty}>{t("blast.priorPrs.empty")}</div>
          )}
        </div>
      )}
    </div>
  );
}

export function BlastPanel({
  prId,
  repoId,
  repoFullName,
  headSha,
}: {
  prId: string | null;
  repoId: string;
  repoFullName: string | null;
  headSha: string | null | undefined;
}) {
  const t = useTranslations("prReview");
  const tc = useTranslations("common");
  const { data: blast, isError, refetch } = useBlast(prId);
  const [view, setView] = React.useState<ViewMode>("tree");

  // A failed query must not masquerade as a perpetual loader — show an error
  // with a retry (only when there's no data to fall back on).
  if (isError && !blast) {
    return (
      <div style={s.empty}>
        <div>{tc("states.error")}</div>
        <div style={{ marginTop: 12 }}>
          <Button kind="secondary" size="sm" onClick={() => refetch()}>
            {tc("actions.retry")}
          </Button>
        </div>
      </div>
    );
  }

  if (!blast) {
    return <div style={s.empty}>{tc("states.loading")}</div>;
  }

  const callerCount = blast.downstream.reduce((n, d) => n + d.callers.length, 0);
  const degraded = blast.index_status !== "full" || blast.degraded;
  const hasSymbols = blast.changed_symbols.length > 0;
  const statusMessage: Record<string, string> = {
    partial: t("blast.indexStatus.partial"),
    degraded: t("blast.indexStatus.degraded"),
    failed: t("blast.indexStatus.failed"),
  };
  const reasonText = blast.reason ?? statusMessage[blast.index_status] ?? t("blast.degradedDefault");

  return (
    <div style={s.root}>
      <SectionLabel icon="Boxes">{t("blast.title")}</SectionLabel>

      <div style={s.metricsRow}>
        <div style={s.metrics}>
          <Metric
            icon={<Icon.Code size={13} style={{ color: "var(--text-muted)" }} />}
            value={blast.changed_symbols.length}
            label={t("blast.symbols")}
          />
          <Metric
            icon={<Icon.CornerDownRight size={13} style={{ color: "var(--text-muted)" }} />}
            value={callerCount}
            label={t("blast.callers")}
          />
          <Metric
            icon={<Icon.Globe size={13} style={{ color: "var(--text-muted)" }} />}
            value={blast.impacted_endpoints.length}
            label={t("blast.endpoints")}
          />
          <Metric
            icon={<Icon.Clock size={13} style={{ color: "var(--text-muted)" }} />}
            value={blast.impacted_crons.length}
            label={t("blast.crons")}
          />
        </div>
        <div style={s.viewToggle}>
          <Button
            kind={view === "tree" ? "secondary" : "ghost"}
            size="sm"
            icon="GitBranch"
            active={view === "tree"}
            onClick={() => setView("tree")}
          >
            {t("blast.treeView")}
          </Button>
          <Button
            kind={view === "graph" ? "secondary" : "ghost"}
            size="sm"
            icon="Workflow"
            active={view === "graph"}
            onClick={() => setView("graph")}
          >
            {t("blast.graphView")}
          </Button>
        </div>
      </div>

      {degraded && (
        <div style={s.degradedBanner} role="status">
          <Icon.AlertTriangle size={13} style={{ color: "var(--warn)", flexShrink: 0 }} />
          <span>{reasonText}</span>
        </div>
      )}

      {view === "graph" ? (
        <div style={s.graphPlaceholder}>{t("blast.graphPlaceholder")}</div>
      ) : hasSymbols ? (
        <div style={s.symbolList}>
          {blast.downstream.map((impact) => (
            <SymbolBlock
              key={impact.symbol}
              impact={impact}
              repoFullName={repoFullName}
              headSha={headSha}
            />
          ))}
        </div>
      ) : (
        <EmptyState icon="Boxes" title={t("blast.emptyTitle")} body={t("blast.emptyBody")} />
      )}

      <PriorPrsAccordion prId={prId} repoId={repoId} />
    </div>
  );
}
