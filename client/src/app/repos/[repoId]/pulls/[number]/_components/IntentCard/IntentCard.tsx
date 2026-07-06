/* IntentCard — derived PR intent/scope, shown at the top of the Overview tab.
   Empty-state until the first compute (no lazy auto-compute on page view —
   see docs/plans/intent-layer.md); a Recompute button re-derives it any time
   (upsert on the server, one row per PR). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Card, SectionLabel, Badge, Button } from "@devdigest/ui";
import { useIntent, useRecomputeIntent } from "@/lib/hooks/intent";
import { s } from "./styles";

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
                <div style={s.chipRow}>
                  {intent.in_scope.map((item, i) => (
                    <Badge key={i}>{item}</Badge>
                  ))}
                </div>
              </div>
            )}
            {intent.out_of_scope.length > 0 && (
              <div>
                <div style={s.label}>{t("intent.outOfScope")}</div>
                <div style={s.chipRow}>
                  {intent.out_of_scope.map((item, i) => (
                    <Badge key={i} color="var(--text-muted)">
                      {item}
                    </Badge>
                  ))}
                </div>
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
