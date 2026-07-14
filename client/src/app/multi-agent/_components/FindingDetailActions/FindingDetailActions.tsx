/* FindingDetailActions — the finding-detail action row for the Multi-Agent
   Review Tabs-detail panel (AC-31, AC-32). STABLE PUBLIC INTERFACE: T10
   (Columns/Tabs shell, a parallel task in the same wave) imports this
   component to mount inside its own confidence/suggestion detail view — do
   not change this file's exported name, `FindingDetailActionsProps` shape, or
   its default export path (`./index.ts`) without checking T10's usage.

   Accept/Dismiss reuse the existing A2 `useFindingAction` hook (same
   endpoint/action kinds as the single-agent FindingsPanel); "Turn into eval
   case" reuses `useCreateEvalCaseFromFinding`. Learn and "Reply to author"
   are visible but permanently disabled ("coming soon") — publishing to
   memory / GitHub is out of scope for this task, so neither wires a mutation
   or fires any request on click. */
"use client";

import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { Finding } from "@devdigest/shared";
import { useFindingAction } from "@/lib/hooks/reviews";
import { useCreateEvalCaseFromFinding } from "@/lib/hooks/eval";
import { s } from "./styles";

export interface FindingDetailActionsProps {
  finding: Finding;
}

export function FindingDetailActions({ finding }: FindingDetailActionsProps) {
  const t = useTranslations("prReview");
  const action = useFindingAction();
  const createEvalCase = useCreateEvalCaseFromFinding();

  const handleTurnIntoEvalCase = () => {
    if (createEvalCase.isPending) return;
    createEvalCase.mutate(finding.id);
  };

  return (
    <div style={s.actions}>
      <Button
        kind="secondary"
        size="sm"
        icon="Check"
        disabled={action.isPending}
        onClick={() => action.mutate({ findingId: finding.id, action: "accept" })}
      >
        {t("finding.accept")}
      </Button>
      <Button
        kind="ghost"
        size="sm"
        icon="X"
        disabled={action.isPending}
        onClick={() => action.mutate({ findingId: finding.id, action: "dismiss" })}
      >
        {t("finding.dismiss")}
      </Button>
      <Button
        kind="ghost"
        size="sm"
        icon="FlaskConical"
        disabled={createEvalCase.isPending}
        onClick={handleTurnIntoEvalCase}
      >
        {t("finding.turnIntoEvalCase")}
      </Button>
      {/* Coming soon — no mutation wired, click is a no-op (AC-32). */}
      <Button kind="ghost" size="sm" icon="Brain" disabled title={t("finding.comingSoon")}>
        {t("finding.learn")}
      </Button>
      <Button kind="ghost" size="sm" icon="MessageSquare" disabled title={t("finding.comingSoon")}>
        {t("finding.replyToAuthor")}
      </Button>
    </div>
  );
}
