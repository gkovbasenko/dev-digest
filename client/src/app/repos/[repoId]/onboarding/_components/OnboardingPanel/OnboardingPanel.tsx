"use client";

import { useTranslations } from "next-intl";
import { Skeleton, EmptyState, ErrorState, Markdown } from "@devdigest/ui";
import type { OnboardingSection } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useOnboarding, useRegenerateOnboarding } from "@/lib/hooks/onboarding";
import { OnboardingHeader } from "../OnboardingHeader";
import { SectionCard } from "../SectionCard";
import { ArchitectureSection } from "../ArchitectureSection";
import { CriticalPathsSection } from "../CriticalPathsSection";
import { HowToRunSection } from "../HowToRunSection";
import { GuidedReadingSection } from "../GuidedReadingSection";
import { FirstTasksSection } from "../FirstTasksSection";
import { SECTION_ICON, SECTION_KINDS, DEFAULT_SECTION_ICON } from "./constants";
import { s } from "./styles";

/** Dispatches a section to its kind-specific renderer. Unknown kinds (should
 *  never happen — the server enforces the exact five kinds) fall back to a
 *  plain markdown body rather than crashing the page. */
function SectionBody({
  section,
  repoFullName,
  defaultBranch,
}: {
  section: OnboardingSection;
  repoFullName?: string | null;
  defaultBranch?: string | null;
}) {
  switch (section.kind) {
    case "architecture":
      return <ArchitectureSection body={section.body} diagram={section.diagram} />;
    case "critical_paths":
      return (
        <CriticalPathsSection links={section.links} repoFullName={repoFullName} defaultBranch={defaultBranch} />
      );
    case "how_to_run":
      return <HowToRunSection body={section.body} />;
    case "guided_reading":
      return <GuidedReadingSection links={section.links} />;
    case "first_tasks":
      return <FirstTasksSection body={section.body} links={section.links} />;
    default:
      return <Markdown>{section.body}</Markdown>;
  }
}

export function OnboardingPanel({
  repoId,
  repoName,
  repoFullName,
  defaultBranch,
}: {
  repoId: string;
  repoName: string;
  repoFullName?: string | null;
  defaultBranch?: string | null;
}) {
  const t = useTranslations("onboarding");
  const { data: doc, isLoading, isError, error, refetch } = useOnboarding(repoId);
  const regenerate = useRegenerateOnboarding(repoId);

  // Guard both Generate and Regenerate triggers on isPending — defense in
  // depth beyond the disabled button (client INSIGHTS 2026-07-01).
  const handleGenerate = () => {
    if (regenerate.isPending) return;
    regenerate.mutate();
  };

  if (isLoading) {
    return (
      <div style={s.list}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} height={72} />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorState
        title={t("loadError.title")}
        body={error instanceof ApiError ? error.message : t("unknownError")}
        onRetry={() => refetch()}
      />
    );
  }

  if (!doc) return null;

  // Not indexed: nothing to ground generation on — no Generate button (AC-13).
  if (!doc.indexed) {
    return <EmptyState icon="Compass" title={t("notIndexed.title")} body={t("notIndexed.body")} />;
  }

  // Indexed but never generated: offer Generate. While pending, the button
  // itself is the non-dismissible progress indicator (spinner + disabled) —
  // there is no way to close this empty state (AC-14).
  if (!doc.exists) {
    return (
      <EmptyState
        icon="Compass"
        title={t("generate.title")}
        body={t("generate.body")}
        cta={regenerate.isPending ? t("generate.generating") : t("generate.cta")}
        onCta={handleGenerate}
        ctaLoading={regenerate.isPending}
      />
    );
  }

  return (
    <div>
      <OnboardingHeader
        repoId={repoId}
        repoName={repoName}
        sourceFileCount={doc.source_file_count}
        generatedAt={doc.generated_at}
        stale={doc.stale}
        isPending={regenerate.isPending}
        isError={regenerate.isError}
        onRegenerate={handleGenerate}
      />

      {doc.sections.length > 0 && (
        <nav aria-label={t("onThisPage")} style={s.onThisPage}>
          <span style={s.onThisPageLabel}>{t("onThisPage")}</span>
          {doc.sections.map((section) => (
            <a key={section.kind} href={`#onboarding-section-${section.kind}`} style={s.onThisPageLink}>
              {(SECTION_KINDS as readonly string[]).includes(section.kind)
                ? t(`sectionTitles.${section.kind}`)
                : section.title}
            </a>
          ))}
        </nav>
      )}

      <div style={s.list}>
        {doc.sections.map((section, i) => (
          <SectionCard
            key={section.kind}
            id={`onboarding-section-${section.kind}`}
            icon={SECTION_ICON[section.kind] ?? DEFAULT_SECTION_ICON}
            title={section.title}
            defaultOpen={i === 0}
          >
            <SectionBody section={section} repoFullName={repoFullName} defaultBranch={defaultBranch} />
          </SectionCard>
        ))}
      </div>
    </div>
  );
}

export default OnboardingPanel;
