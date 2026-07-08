"use client";

import { useTranslations } from "next-intl";
import { MonoLink } from "@devdigest/ui";
import type { OnboardingLink } from "@devdigest/shared";
import { s } from "./styles";

export function GuidedReadingSection({ links }: { links: OnboardingLink[] }) {
  const t = useTranslations("onboarding");

  if (links.length === 0) {
    return <p style={s.empty}>{t("guidedReading.empty")}</p>;
  }

  return (
    <ol style={s.list}>
      {links.map((link, i) => (
        <li key={`${link.path}-${i}`} style={s.item}>
          <MonoLink>{link.path}</MonoLink>
          {link.label && <p style={s.rationale}>{link.label}</p>}
        </li>
      ))}
    </ol>
  );
}

export default GuidedReadingSection;
