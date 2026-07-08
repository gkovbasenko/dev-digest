import type { RiskBrief } from '@devdigest/shared';

/**
 * Grounding (citation gate) for the generated brief. Mirrors the pattern used
 * by onboarding's link-grounding: drop any file reference the model emitted
 * that isn't one of the PR's real changed files or otherwise recognized as
 * indexed by the repo-intel oracle (AC-7). Pure function — the caller
 * (`service.ts`) builds `validPaths` from `pr_files ∪ getFileRank(...)`.
 */

export interface GroundBriefResult {
  brief: RiskBrief;
  droppedCount: number;
}

export function groundBrief(brief: RiskBrief, validPaths: Set<string>): GroundBriefResult {
  let droppedCount = 0;

  const risks = brief.risks.map((risk) => {
    const file_refs = risk.file_refs.filter((path) => {
      const keep = validPaths.has(path);
      if (!keep) droppedCount += 1;
      return keep;
    });
    return { ...risk, file_refs };
  });

  const review_focus = brief.review_focus.filter((item) => {
    const keep = validPaths.has(item.file);
    if (!keep) droppedCount += 1;
    return keep;
  });

  return { brief: { ...brief, risks, review_focus }, droppedCount };
}
