import type { CiFile } from '@devdigest/shared';
import { MANIFEST_DIR, MEMORY_PATH, RUNNER_ENTRY_PATH, SKILLS_DIR, WORKFLOW_PATH } from './constants.js';

/** One skill's already-resolved (marker-stripped) body + its per-bundle-unique slug. */
export interface BundleSkill {
  slug: string;
  body: string;
}

export interface BuildBundleInput {
  manifestSlug: string;
  manifestYaml: string;
  /** Enabled skills only, already run through `stripUntrustedMarkers` by the caller (AC-3). */
  skills: BundleSkill[];
  /** The `agent-runner` ncc bundle contents (read by `runner-bundle.ts`, injected here). */
  runnerBundle: string;
  workflowYaml: string;
}

/**
 * Pure bundle assembler (AC-1/AC-3/AC-5/AC-6). No I/O — data in, `CiFile[]`
 * out. The manifest and workflow are editable (the user may hand-tune
 * triggers/prompt before installing); the runner bundle is not — it is the
 * compiled `agent-runner` artifact, not meant for hand-editing.
 */
export function buildBundle(input: BuildBundleInput): CiFile[] {
  return [
    { path: `${MANIFEST_DIR}/${input.manifestSlug}.yaml`, contents: input.manifestYaml, editable: true },
    ...input.skills.map((s) => ({
      path: `${SKILLS_DIR}/${s.slug}.md`,
      contents: s.body,
      editable: true,
    })),
    // AC-6 — no per-agent memory store exists; always empty, not a placeholder.
    { path: MEMORY_PATH, contents: '', editable: true },
    { path: RUNNER_ENTRY_PATH, contents: input.runnerBundle, editable: false },
    { path: WORKFLOW_PATH, contents: input.workflowYaml, editable: true },
  ];
}
