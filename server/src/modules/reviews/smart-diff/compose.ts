import { SmartDiff, type Finding, type PrFile, type SmartDiffGroup, type SmartDiffRole } from '@devdigest/shared';
import { classifyFile } from './classify.js';
import { SPLIT_TOO_BIG_LINES } from './constants.js';

/** Fixed display order: business logic first, generated noise last. */
const GROUP_ORDER: SmartDiffRole[] = ['core', 'wiring', 'boilerplate'];

/**
 * Smart Diff composer (S3). Pure function of already-fetched files +
 * already-computed findings — no I/O, no LLM call. Classifies each file
 * (S2), overlays finding line numbers from the caller-supplied findings
 * (latest review only — see the caveat at the call site in `service.ts`),
 * groups files core → wiring → boilerplate, and derives a deterministic
 * split suggestion. Output is parsed through the `SmartDiff` zod schema
 * before returning, so any shape drift fails loud rather than silently
 * reaching the client with a stale/invalid contract.
 */
export function composeSmartDiff(files: PrFile[], findings: Finding[]): SmartDiff {
  const byRole = new Map<SmartDiffRole, SmartDiffGroup['files']>();
  for (const role of GROUP_ORDER) byRole.set(role, []);

  for (const file of files) {
    const role = classifyFile(file.path);
    const findingLines = findings
      .filter((f) => f.file === file.path)
      .map((f) => f.start_line);

    byRole.get(role)!.push({
      path: file.path,
      pseudocode_summary: null,
      additions: file.additions,
      deletions: file.deletions,
      finding_lines: findingLines,
    });
  }

  const groups: SmartDiffGroup[] = GROUP_ORDER.filter((role) => byRole.get(role)!.length > 0).map(
    (role) => ({ role, files: byRole.get(role)! }),
  );

  const totalLines = files.reduce((sum, f) => sum + f.additions + f.deletions, 0);
  const tooBig = totalLines > SPLIT_TOO_BIG_LINES;

  // Group by top-level directory (first path segment); files with no `/`
  // (repo-root files) fall under a single '.' bucket.
  const byDir = new Map<string, string[]>();
  for (const file of files) {
    const idx = file.path.indexOf('/');
    const dir = idx === -1 ? '.' : file.path.slice(0, idx);
    const bucket = byDir.get(dir);
    if (bucket) bucket.push(file.path);
    else byDir.set(dir, [file.path]);
  }
  const proposedSplits =
    tooBig && byDir.size > 1
      ? Array.from(byDir.entries()).map(([name, filePaths]) => ({ name, files: filePaths }))
      : [];

  const result = {
    groups,
    split_suggestion: {
      too_big: tooBig,
      total_lines: totalLines,
      proposed_splits: proposedSplits,
    },
  };

  return SmartDiff.parse(result);
}
