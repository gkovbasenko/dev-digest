/* Derive the per-run severity counts + top-5 preview rows from the loaded
   review records. Filters out dismissed findings so the timeline mirrors the
   PR list ("open findings only"). */
import type { ReviewRecord } from "@devdigest/shared";
import type { PreviewFinding, SeverityCounts } from "@/components/findings-preview";

const SEV_WEIGHT: Record<string, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };
const TOP_FINDINGS_PER_RUN = 5;

/** Must stay in sync with server/src/modules/pulls/helpers.ts RATIONALE_EXCERPT_LEN. */
const RATIONALE_EXCERPT_LEN = 200;

export interface RunPreview {
  counts: SeverityCounts;
  top: PreviewFinding[];
}

function excerptRationale(text: string): string {
  return text.length > RATIONALE_EXCERPT_LEN
    ? text.slice(0, RATIONALE_EXCERPT_LEN).trimEnd() + "…"
    : text;
}

export function buildRunPreviewMap(reviews: ReviewRecord[]): Map<string, RunPreview> {
  const map = new Map<string, RunPreview>();
  for (const review of reviews) {
    if (!review.run_id) continue;
    const counts: SeverityCounts = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
    const sorted = [...review.findings]
      .filter((f) => !f.dismissed_at)
      .sort((a, b) => {
        const sa = SEV_WEIGHT[a.severity] ?? 9;
        const sb = SEV_WEIGHT[b.severity] ?? 9;
        if (sa !== sb) return sa - sb;
        if (a.file !== b.file) return a.file < b.file ? -1 : 1;
        return a.start_line - b.start_line;
      });
    for (const f of sorted) {
      if (f.severity === "CRITICAL" || f.severity === "WARNING" || f.severity === "SUGGESTION") {
        counts[f.severity] += 1;
      }
    }
    const top: PreviewFinding[] = sorted
      .filter(
        (f): f is typeof f & { severity: "CRITICAL" | "WARNING" | "SUGGESTION" } =>
          f.severity === "CRITICAL" ||
          f.severity === "WARNING" ||
          f.severity === "SUGGESTION",
      )
      .slice(0, TOP_FINDINGS_PER_RUN)
      .map((f) => ({
        id: f.id,
        severity: f.severity,
        category: f.category,
        title: f.title,
        file: f.file,
        start_line: f.start_line,
        end_line: f.end_line,
        confidence: f.confidence,
        rationale_excerpt: excerptRationale(f.rationale),
      }));
    map.set(review.run_id, { counts, top });
  }
  return map;
}
