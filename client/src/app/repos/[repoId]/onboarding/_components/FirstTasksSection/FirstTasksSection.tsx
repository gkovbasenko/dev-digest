/* FirstTasksSection — a short list of good first tasks for a newcomer. The
   contract only has body/links (no dedicated "tasks" field), so the list
   itself is the section's markdown body; any linked files are a secondary,
   optional list underneath. */
"use client";

import { useTranslations } from "next-intl";
import { Markdown, MonoLink } from "@devdigest/ui";
import type { OnboardingLink } from "@devdigest/shared";
import { s } from "./styles";

export function FirstTasksSection({ body, links }: { body: string; links: OnboardingLink[] }) {
  const t = useTranslations("onboarding");
  const hasBody = Boolean(body && body.trim());

  if (!hasBody && links.length === 0) {
    return <p style={s.empty}>{t("firstTasks.empty")}</p>;
  }

  return (
    <div>
      {hasBody && <Markdown>{body}</Markdown>}
      {links.length > 0 && (
        <ul style={s.linkList}>
          {links.map((link, i) => (
            <li key={`${link.path}-${i}`} style={s.item}>
              <MonoLink>{link.path}</MonoLink>
              {link.label && <p style={s.rationale}>{link.label}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default FirstTasksSection;
