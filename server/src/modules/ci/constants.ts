/**
 * Export-to-CI constants: bundle paths, branch/workflow naming, and the
 * secret NAMES (never values — AC-24/AC-31) the generated workflow expects
 * the target repo to have configured.
 */

/** Branch every `open_pr` export commits to — never the base branch. */
export const CI_BRANCH = 'devdigest/ci';

/** Filename of the generated GitHub Actions workflow (also the `listWorkflowRuns` workflow_id). */
export const WORKFLOW_FILENAME = 'devdigest-review.yml';
export const WORKFLOW_PATH = `.github/workflows/${WORKFLOW_FILENAME}`;

/** Bundle layout under `.devdigest/` (mirrors `agent-runner`'s expectations). */
export const MANIFEST_DIR = '.devdigest/agents';
export const SKILLS_DIR = '.devdigest/skills';
/** AC-6 — no per-agent memory store exists yet; this file is ALWAYS empty. */
export const MEMORY_PATH = '.devdigest/memory.jsonl';
export const RUNNER_ENTRY_PATH = '.devdigest/runner/index.js';

/** Uploaded-artifact name and on-disk result filename the runner writes (agent-runner/src/run.ts). */
export const ARTIFACT_NAME = 'devdigest-result';
export const RESULT_FILE = 'devdigest-result.json';

/** Default `CiExportInput.triggers` when the caller supplies none. */
export const DEFAULT_TRIGGERS = ['opened', 'synchronize', 'reopened'];
/** PR-event trigger types the generated workflow understands. */
export const VALID_TRIGGERS = new Set([
  'opened',
  'synchronize',
  'reopened',
  'edited',
  'ready_for_review',
]);

/**
 * Secret NAMES the generated workflow references via `${{ secrets.* }}` — the
 * UI displays these as display-only labels (AC-9/AC-10), never a value input.
 */
export const EXPECTED_SECRET_NAMES = ['OPENROUTER_API_KEY', 'GITHUB_TOKEN'] as const;
