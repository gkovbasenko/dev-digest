/* OnboardingHeader — title/subtitle + Regenerate/Share actions for the
   exists===true state (AC-15). Stale hint (AC-20) and an inline retry after a
   failed regenerate (AC-21) render here too; the global mutation-error toast
   is already wired (providers.tsx MutationCache) so no local onError is
   needed to surface the failure — this is in addition to that, not instead. */
"use client";

import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { useToast } from "@/lib/toast";
import { relativeTime } from "../../helpers";
import { s } from "./styles";

export function OnboardingHeader({
  repoId,
  repoName,
  sourceFileCount,
  generatedAt,
  stale,
  isPending,
  isError,
  onRegenerate,
}: {
  repoId: string;
  repoName: string;
  sourceFileCount: number;
  generatedAt: string | null;
  stale: boolean;
  isPending: boolean;
  isError: boolean;
  onRegenerate: () => void;
}) {
  const t = useTranslations("onboarding");
  const toast = useToast();

  const handleShare = () => {
    const url = `${window.location.origin}/repos/${repoId}/onboarding`;
    if (!navigator.clipboard?.writeText) {
      toast.error(t("shareLinkFailed"));
      return;
    }
    navigator.clipboard
      .writeText(url)
      .then(() => toast.success(t("shareLinkCopied")))
      .catch(() => toast.error(t("shareLinkFailed")));
  };

  // Defense in depth: the Button itself is disabled while pending, but guard
  // both triggers (Regenerate button + inline retry) so a second click can't
  // fire a concurrent mutation (client INSIGHTS 2026-07-01).
  const handleRegenerateClick = () => {
    if (isPending) return;
    onRegenerate();
  };

  return (
    <div style={s.header}>
      <div style={s.headerTop}>
        <div>
          <h1 style={s.title}>{t("heading", { repo: repoName })}</h1>
          <p style={s.subtitle}>
            {t("subtitle", { count: sourceFileCount, relative: relativeTime(generatedAt) })}
          </p>
        </div>
        <div style={s.actions}>
          <Button kind="ghost" size="sm" icon="Link" onClick={handleShare}>
            {t("shareLink")}
          </Button>
          <Button
            kind="secondary"
            size="sm"
            icon="RefreshCw"
            disabled={isPending}
            loading={isPending}
            onClick={handleRegenerateClick}
          >
            {isPending ? t("regenerating") : t("regenerate")}
          </Button>
        </div>
      </div>
      {stale && (
        <p role="status" style={s.staleHint}>
          {t("stale")}
        </p>
      )}
      {isError && (
        <p role="alert" style={s.retryHint}>
          {t("regenerateFailed")}{" "}
          <button type="button" onClick={handleRegenerateClick} style={s.retryLink}>
            {t("retry")}
          </button>
        </p>
      )}
    </div>
  );
}

export default OnboardingHeader;
