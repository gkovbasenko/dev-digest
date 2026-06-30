/** Max characters of rationale text sent to the PR-list hover preview. */
export const RATIONALE_EXCERPT_LEN = 200;

/** Clip rationale to RATIONALE_EXCERPT_LEN chars, appending '…' when truncated. */
export function excerptRationale(text: string): string {
  return text.length > RATIONALE_EXCERPT_LEN
    ? text.slice(0, RATIONALE_EXCERPT_LEN).trimEnd() + '…'
    : text;
}
