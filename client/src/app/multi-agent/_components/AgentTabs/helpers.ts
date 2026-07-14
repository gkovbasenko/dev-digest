/* helpers.ts — pure lookup for AgentTabs' finding-detail pane (AC-26).
   `AgentColumn.findings` is the narrow `AgentColumnFinding` projection (no
   confidence/rationale/suggestion — see `observability.ts`); the detail pane
   needs the full `Finding` shape, which only exists on the persisted
   `ReviewRecord`s for this PR (`usePrReviews`). Flattening every review's
   findings into an id→FindingRecord map lets a selected AgentColumnFinding be
   enriched by id — finding ids are unique, so this is safe even though
   `usePrReviews` returns every review for the PR, not just this group's. */

export interface FindingLike {
  id: string;
}

export interface ReviewLike<F extends FindingLike> {
  findings: F[];
}

export function buildFindingLookup<F extends FindingLike>(
  reviews: ReviewLike<F>[] | undefined,
): Map<string, F> {
  const map = new Map<string, F>();
  for (const review of reviews ?? []) {
    for (const finding of review.findings) map.set(finding.id, finding);
  }
  return map;
}
