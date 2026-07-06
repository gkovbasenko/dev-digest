/**
 * C1 — hunk-header extractor.
 *
 * The intent-compute prompt (C2) deliberately excludes diff BODIES (the cost
 * angle of this feature) but still wants a cheap structural signal per changed
 * file: the `@@ -a,b +c,d @@` hunk header lines, which name the touched
 * line ranges (and, for languages whose diff driver detects it, the enclosing
 * function/class) without any of the actual added/removed code.
 */

/**
 * Matches a real unified-diff hunk header: `@@ -a[,b] +c[,d] @@` (optionally
 * followed by function/section context). A `startsWith('@@')` check is not
 * enough: body lines are trimmed first, so a space-prefixed CONTEXT line whose
 * code starts with `@@` (e.g. a Ruby class variable `@@count = 0`) would
 * otherwise be mistaken for a header and leak a real diff-body line into the
 * intent prompt — defeating the headers-only cost design.
 */
const HUNK_HEADER_RE = /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/;

/** Extract only the `@@ … @@` header lines from a unified-diff patch string. */
export function extractHunkHeaders(patch: string | null | undefined): string[] {
  if (!patch) return [];
  return patch
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => HUNK_HEADER_RE.test(line));
}

export interface FileHunkHeaders {
  path: string;
  headers: string[];
}

/** Per-file hunk headers for a PR's changed files (`pr_files` rows). */
export function hunkHeadersForFiles(
  files: { path: string; patch: string | null | undefined }[],
): FileHunkHeaders[] {
  return files.map((f) => ({ path: f.path, headers: extractHunkHeaders(f.patch) }));
}
