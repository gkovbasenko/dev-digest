/* IntentCard — derived PR intent/scope, shown at the top of the Overview tab.
   Empty-state until the first compute (no lazy auto-compute on page view —
   see docs/plans/intent-layer.md); a Recompute button re-derives it any time
   (upsert on the server, one row per PR). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Card, SectionLabel, Icon, Button } from "@devdigest/ui";
import { useIntent, useRecomputeIntent } from "@/lib/hooks/intent";
import { s } from "./styles";

/** Scope items are full sentences, not tags — render them as a wrapping ✓/✗
    checklist (a nowrap Badge overflows the column into the Blast panel). */
function ScopeList({ items, kind }: { items: string[]; kind: "in" | "out" }) {
  const Glyph = kind === "in" ? Icon.CheckCircle : Icon.XCircle;
  const color = kind === "in" ? "var(--ok)" : "var(--text-muted)";
  return (
    <ul style={s.scopeList}>
      {items.map((item, i) => (
        <li key={i} style={s.scopeItem}>
          <Glyph size={14} style={{ color, flexShrink: 0, marginTop: 2 }} />
          <span style={s.scopeText}>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function IntentCard({ prId }: { prId: string | number | null | undefined }) {
  const t = useTranslations("prReview");
  const { data: intent } = useIntent(prId);
  const recompute = useRecomputeIntent(prId);

  return (
    <section>
      <SectionLabel
        icon="Target"
        right={
          intent ? (
            <Button
              kind="ghost"
              size="sm"
              icon="RefreshCw"
              loading={recompute.isPending}
              onClick={() => recompute.mutate()}
            >
              {t("intent.recompute")}
            </Button>
          ) : undefined
        }
      >
        {t("intent.title")}
      </SectionLabel>
      <Card>
        {intent ? (
          <div style={s.body}>
            <div>
              <div style={s.label}>{t("intent.summary")}</div>
              <p style={s.summary}>{intent.intent}</p>
            </div>
            {intent.in_scope.length > 0 && (
              <div>
                <div style={s.label}>{t("intent.inScope")}</div>
                <ScopeList items={intent.in_scope} kind="in" />
              </div>
            )}
            {intent.out_of_scope.length > 0 && (
              <div>
                <div style={s.label}>{t("intent.outOfScope")}</div>
                <ScopeList items={intent.out_of_scope} kind="out" />
              </div>
            )}
          </div>
        ) : (
          <div style={s.empty}>
            <div style={s.emptyTitle}>{t("intent.emptyTitle")}</div>
            <Button
              kind="secondary"
              icon="Target"
              loading={recompute.isPending}
              onClick={() => recompute.mutate()}
            >
              {t("intent.compute")}
            </Button>
          </div>
        )}
      </Card>
    </section>
  );
}
