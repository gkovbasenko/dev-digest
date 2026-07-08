"use client";

import { useTranslations } from "next-intl";
import { MonoLink } from "@devdigest/ui";
import type { OnboardingLink } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { s } from "./styles";

export function CriticalPathsSection({
  links,
  repoFullName,
  defaultBranch,
}: {
  links: OnboardingLink[];
  repoFullName?: string | null;
  defaultBranch?: string | null;
}) {
  const t = useTranslations("onboarding");

  if (links.length === 0) {
    return <p style={s.empty}>{t("criticalPaths.empty")}</p>;
  }

  return (
    <ol style={s.list}>
      {links.map((link, i) => {
        const href =
          repoFullName && defaultBranch ? githubBlobUrl(repoFullName, defaultBranch, link.path) : undefined;
        return (
          <li key={`${link.path}-${i}`} style={s.item}>
            <div style={s.pathRow}>
              <MonoLink>{link.path}</MonoLink>
              {href && (
                <a href={href} target="_blank" rel="noopener noreferrer" style={s.openLink}>
                  {t("criticalPaths.open")}
                </a>
              )}
            </div>
            {link.label && <p style={s.why}>{link.label}</p>}
          </li>
        );
      })}
    </ol>
  );
}

export default CriticalPathsSection;
