import type { useTranslations } from "next-intl";

/** `$0.04`, or an em-dash when the model isn't in the pricing table (AC-27). */
export const fmtCost = (n: number | null): string => (n == null ? "—" : `$${n.toFixed(2)}`);

/** `12s`, or an em-dash when duration wasn't ingested (AC-27). */
export const fmtDuration = (sec: number | null | undefined): string =>
  sec == null ? "—" : `${Math.round(sec)}s`;

/** `CiRun` has no `repo` column; derive `owner/name` from the Actions job URL
    (`https://github.com/owner/name/actions/runs/123`). `—` when unparseable. */
export function repoFromUrl(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/github\.com\/([^/]+\/[^/]+)/);
  return m?.[1] ?? null;
}

export function statusLabel(
  t: ReturnType<typeof useTranslations>,
  status: string | null,
): string {
  switch (status) {
    case "succeeded":
      return t("runs.status.succeeded");
    case "failed":
      return t("runs.status.failed");
    case "no_findings":
      return t("runs.status.noFindings");
    case "running":
      return t("runs.status.running");
    default:
      return status ?? "—";
  }
}
