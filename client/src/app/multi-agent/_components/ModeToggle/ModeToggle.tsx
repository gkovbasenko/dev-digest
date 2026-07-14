/* ModeToggle — Columns/Tabs segmented control for the /multi-agent Results
   area (AC-27). Pure presentational: holds no state of its own and never
   touches any run-triggering mutation, so switching views can never
   re-trigger the multi-agent run — a plain callback prop is the only effect.
   Two native `<button>`s (not a checkbox-style `Toggle`) so each mode has an
   explicit, keyboard-reachable, `aria-pressed` accessible name — clearer than
   a boolean switch for a two-named-option choice. */
"use client";

import { useTranslations } from "next-intl";
import { s } from "./styles";

export type ResultsMode = "columns" | "tabs";

export function ModeToggle({
  mode,
  onChange,
}: {
  mode: ResultsMode;
  onChange: (mode: ResultsMode) => void;
}) {
  const t = useTranslations("runs");
  return (
    <div role="group" aria-label={`${t("page.view.columns")} / ${t("page.view.tabs")}`} style={s.wrap}>
      <button
        type="button"
        aria-pressed={mode === "columns"}
        onClick={() => onChange("columns")}
        style={s.btn(mode === "columns")}
      >
        {t("page.view.columns")}
      </button>
      <button
        type="button"
        aria-pressed={mode === "tabs"}
        onClick={() => onChange("tabs")}
        style={s.btn(mode === "tabs")}
      >
        {t("page.view.tabs")}
      </button>
    </div>
  );
}
