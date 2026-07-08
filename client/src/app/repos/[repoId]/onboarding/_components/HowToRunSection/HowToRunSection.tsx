"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Markdown, Button } from "@devdigest/ui";
import { useToast } from "@/lib/toast";
import { parseHowToRunSteps } from "./helpers";
import { s } from "./styles";

export function HowToRunSection({ body }: { body: string }) {
  const t = useTranslations("onboarding");
  const toast = useToast();
  const steps = React.useMemo(() => parseHowToRunSteps(body), [body]);
  const [copiedIndex, setCopiedIndex] = React.useState<number | null>(null);

  if (steps.length === 0) {
    return <p style={s.empty}>{t("howToRun.empty")}</p>;
  }

  const handleCopy = (index: number, code: string) => {
    if (!navigator.clipboard?.writeText) {
      toast.error(t("howToRun.copyFailed"));
      return;
    }
    navigator.clipboard
      .writeText(code)
      .then(() => {
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex((c) => (c === index ? null : c)), 1500);
      })
      .catch(() => toast.error(t("howToRun.copyFailed")));
  };

  return (
    <ol style={s.list}>
      {steps.map((step, i) =>
        step.type === "code" ? (
          <li key={i}>
            <div style={s.codeBlock}>
              <pre style={s.pre}>
                <code className="mono">{step.content}</code>
              </pre>
              <div style={s.copyRow}>
                <Button kind="ghost" size="sm" icon="Copy" onClick={() => handleCopy(i, step.content)}>
                  {copiedIndex === i ? t("howToRun.copied") : t("howToRun.copy")}
                </Button>
              </div>
            </div>
          </li>
        ) : (
          <li key={i}>
            <Markdown>{step.content}</Markdown>
          </li>
        ),
      )}
    </ol>
  );
}

export default HowToRunSection;
