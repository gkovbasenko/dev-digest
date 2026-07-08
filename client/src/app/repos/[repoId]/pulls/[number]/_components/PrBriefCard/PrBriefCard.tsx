/* PrBriefCard — the Why+Risk Brief, shown as a full-width section on the
   Overview tab (below the Intent/Blast columns). Empty-state until the first
   generate (no auto-fire on mount — mirrors IntentCard); a Regenerate button
   re-derives it any time (upsert on the server, one row per PR, read is a
   cached GET with zero LLM calls). `risk_level`/per-risk `severity` are
   color-coded but always carry a visible text label too (WCAG — color alone
   is never the only signal). `file_refs`/`review_focus[].file` link to the
   GitHub blob at the PR's head SHA (mirrors BlastPanel's MonoLink pattern);
   unresolvable (no repoFullName/headSha) renders as plain, non-interactive
   text instead of a dead link. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Card, SectionLabel, Icon, Button, Badge, MonoLink } from "@devdigest/ui";
import { useBrief, useRegenerateBrief } from "@/lib/hooks/brief";
import { githubBlobUrl } from "@/lib/github-urls";
import type { RiskBrief } from "@/lib/types";
import { s } from "./styles";

type Risk = RiskBrief["risks"][number];
type ReviewFocusItem = RiskBrief["review_focus"][number];
type RiskLevel = RiskBrief["risk_level"];

const RISK_COLOR: Record<RiskLevel, string> = {
  high: "var(--crit)",
  medium: "var(--warn)",
  low: "var(--ok)",
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

/** A file[:line] reference — a real link to the GitHub blob when we have
    enough context to build one, otherwise inert mono text (never a dead
    link). Mirrors BlastPanel's caller-row MonoLink pattern. */
function FileRefLink({
  file,
  line,
  repoFullName,
  headSha,
}: {
  file: string;
  line?: number;
  repoFullName: string | null;
  headSha: string | null | undefined;
}) {
  const href = repoFullName && headSha ? githubBlobUrl(repoFullName, headSha, file, line) : undefined;
  return <MonoLink href={href}>{line != null ? `${file}:${line}` : file}</MonoLink>;
}

/** Color-coded severity/risk-level chip that ALWAYS carries a text label —
    color is never the only signal (AC-12). */
function LevelBadge({ level, label }: { level: RiskLevel; label: string }) {
  return (
    <Badge color={RISK_COLOR[level]} dot>
      {label}
    </Badge>
  );
}

function RiskItem({
  risk,
  severityLabel,
  repoFullName,
  headSha,
}: {
  risk: Risk;
  severityLabel: string;
  repoFullName: string | null;
  headSha: string | null | undefined;
}) {
  return (
    <div style={s.riskItem}>
      <div style={s.riskHeader}>
        <span style={s.riskTitle}>{risk.title}</span>
        <LevelBadge level={risk.severity} label={severityLabel} />
      </div>
      {/* Sentence-length LLM prose — wrapping text, never a Badge. */}
      <p style={s.explanation}>{risk.explanation}</p>
      {risk.file_refs.length > 0 && (
        <div style={s.fileRefRow}>
          {risk.file_refs.map((file) => (
            <FileRefLink key={file} file={file} repoFullName={repoFullName} headSha={headSha} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewFocusRow({
  item,
  repoFullName,
  headSha,
}: {
  item: ReviewFocusItem;
  repoFullName: string | null;
  headSha: string | null | undefined;
}) {
  return (
    <li style={s.focusItem}>
      <FileRefLink file={item.file} line={item.line} repoFullName={repoFullName} headSha={headSha} />
      <span style={s.focusNote}>{item.note}</span>
    </li>
  );
}

export function PrBriefCard({
  prId,
  repoFullName,
  headSha,
}: {
  prId: string | number | null | undefined;
  repoFullName: string | null;
  headSha: string | null | undefined;
}) {
  const t = useTranslations("prReview");
  const tc = useTranslations("common");
  const { data, isError, refetch } = useBrief(prId);
  const regenerate = useRegenerateBrief(prId);

  const handleGenerate = () => {
    // Guard both Generate and Regenerate on isPending — a second click while
    // a mutation is in flight must not fire a concurrent call (AC-15).
    if (regenerate.isPending) return;
    regenerate.mutate();
  };

  const RISK_LEVEL_LABEL: Record<RiskLevel, string> = {
    high: t("brief.riskLevel.high"),
    medium: t("brief.riskLevel.medium"),
    low: t("brief.riskLevel.low"),
  };
  const SEVERITY_LABEL: Record<RiskLevel, string> = {
    high: t("brief.severity.high"),
    medium: t("brief.severity.medium"),
    low: t("brief.severity.low"),
  };

  // A failed read query must not masquerade as a perpetual loader — show an
  // error with a retry (only when there's no cached data to fall back on).
  if (isError && !data) {
    return (
      <section>
        <SectionLabel icon="FileText">{t("brief.title")}</SectionLabel>
        <Card>
          <div style={s.loadingOrError}>
            <div>{tc("states.error")}</div>
            <div style={{ marginTop: 12 }}>
              <Button kind="secondary" size="sm" onClick={() => refetch()}>
                {tc("actions.retry")}
              </Button>
            </div>
          </div>
        </Card>
      </section>
    );
  }

  if (!data) {
    return (
      <section>
        <SectionLabel icon="FileText">{t("brief.title")}</SectionLabel>
        <Card>
          <div style={s.loadingOrError}>{tc("states.loading")}</div>
        </Card>
      </section>
    );
  }

  return (
    <section>
      <SectionLabel
        icon="FileText"
        right={
          data.exists ? (
            <Button
              kind="ghost"
              size="sm"
              icon="RefreshCw"
              loading={regenerate.isPending}
              disabled={regenerate.isPending}
              onClick={handleGenerate}
            >
              {t("brief.regenerate")}
            </Button>
          ) : undefined
        }
      >
        {t("brief.title")}
      </SectionLabel>
      <Card>
        {!data.exists || !data.brief ? (
          // No auto-fire on mount — the first brief is generated on demand
          // only (AC-16).
          <div style={s.generateEmpty}>
            <div style={s.generateEmptyTitle}>{t("brief.emptyTitle")}</div>
            <Button
              kind="secondary"
              icon="Sparkles"
              loading={regenerate.isPending}
              disabled={regenerate.isPending}
              onClick={handleGenerate}
            >
              {t("brief.generate")}
            </Button>
          </div>
        ) : (
          <div style={s.body}>
            {data.stale && (
              // Non-blocking — the cached brief below still renders in full.
              <div style={s.staleHint} role="status">
                <Icon.AlertTriangle size={13} style={{ color: "var(--warn)", flexShrink: 0 }} />
                <span>{t("brief.staleHint")}</span>
              </div>
            )}

            {regenerate.isError && (
              // A failed regenerate keeps the prior brief on screen (rendered
              // below, unchanged) — this is just an inline retry affordance;
              // the toast itself is wired globally (providers.tsx).
              <div style={s.regenerateError} role="alert">
                <span>{t("brief.regenerateFailed")}</span>
                <Button kind="ghost" size="sm" onClick={handleGenerate} disabled={regenerate.isPending}>
                  {t("brief.retry")}
                </Button>
              </div>
            )}

            <div style={s.headerRow}>
              <LevelBadge level={data.brief.risk_level} label={RISK_LEVEL_LABEL[data.brief.risk_level]} />
              {data.generated_at && (
                <span style={s.generatedAt}>
                  {t("brief.generatedAt", { when: formatWhen(data.generated_at) })}
                </span>
              )}
            </div>

            <div>
              <div style={s.label}>{t("brief.what")}</div>
              <p style={s.text}>{data.brief.what}</p>
            </div>
            <div>
              <div style={s.label}>{t("brief.why")}</div>
              <p style={s.text}>{data.brief.why}</p>
            </div>

            {data.brief.risks.length > 0 && (
              <div>
                <div style={s.label}>{t("brief.risksTitle")}</div>
                <div style={s.riskList}>
                  {data.brief.risks.map((risk, i) => (
                    <RiskItem
                      key={i}
                      risk={risk}
                      severityLabel={SEVERITY_LABEL[risk.severity]}
                      repoFullName={repoFullName}
                      headSha={headSha}
                    />
                  ))}
                </div>
              </div>
            )}

            {data.brief.review_focus.length > 0 && (
              <div>
                <div style={s.label}>{t("brief.reviewFocusTitle")}</div>
                <ol style={s.focusList}>
                  {data.brief.review_focus.map((item, i) => (
                    <ReviewFocusRow
                      key={`${item.file}:${item.line ?? ""}:${i}`}
                      item={item}
                      repoFullName={repoFullName}
                      headSha={headSha}
                    />
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}
      </Card>
    </section>
  );
}
