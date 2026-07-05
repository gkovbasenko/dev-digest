import { githubBlobUrl } from "@/lib/github-urls";

export function evidenceHref(
  repoFullName: string | null | undefined,
  defaultBranch: string | null | undefined,
  path: string | null,
): string | undefined {
  if (!repoFullName || !defaultBranch || !path) return undefined;
  return githubBlobUrl(repoFullName, defaultBranch, path);
}
