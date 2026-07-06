/**
 * Smart Diff constants. Deterministic classification — no LLM call. Path
 * patterns here are the ONLY inputs to `classifyFile` (see `classify.ts`);
 * keep this file the single source of truth for the pattern lists.
 */

// --- Split suggestion --------------------------------------------------------
/** [S3] `split_suggestion.too_big` fires when a PR's total changed lines
 *  (additions + deletions, across ALL files) exceeds this threshold. */
export const SPLIT_TOO_BIG_LINES = 400;

// --- Boilerplate classification ---------------------------------------------
// Generated/vendored/noise files a reviewer's eye should skip entirely.
// Checked BEFORE wiring — e.g. a lockfile living under a config-ish path still
// classifies as boilerplate, never wiring.

/** Exact / suffix matches for generated lockfiles. */
export const BOILERPLATE_LOCKFILES = [
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'go.sum',
] as const;

/** Any path segment ending in `.lock` (in addition to the named lockfiles above). */
export const BOILERPLATE_LOCK_SUFFIX = '.lock';

/** Directories whose entire contents are generated/vendored build output. */
export const BOILERPLATE_DIRS = ['dist', 'build', 'out', '.next', 'vendor', 'coverage'] as const;

/** Snapshot/minified/sourcemap noise, wherever it lives. */
export const BOILERPLATE_SNAPSHOT_DIR = '__snapshots__';
export const BOILERPLATE_SNAP_SUFFIX = '.snap';
export const BOILERPLATE_MIN_INFIX = '.min.';
export const BOILERPLATE_MAP_SUFFIX = '.map';

// --- Wiring classification ---------------------------------------------------
// Config/plumbing files: not business logic, but not throwaway noise either —
// worth a quick glance, just not first.

/**
 * `*.config.*`-style filenames — matches a bare `config.ts`/`config.js` as
 * well as prefixed variants like `vite.config.ts`, `jest.config.js`. Anchored
 * on the basename so a directory named `config/` does not itself match.
 */
export const WIRING_CONFIG_RE = /(^|\.)config\.[^./]+$/;

/** `tsconfig*.json` — any tsconfig variant (base, build, test, ...). */
export const WIRING_TSCONFIG_PREFIX = 'tsconfig';
export const WIRING_TSCONFIG_SUFFIX = '.json';

/** Exact package manifest filename, any directory depth. */
export const WIRING_PACKAGE_JSON = 'package.json';

/** CI/workflow directory. */
export const WIRING_GITHUB_DIR = '.github';

/** Barrel re-export files, any directory depth. */
export const WIRING_INDEX_BASENAMES = ['index.ts', 'index.js'] as const;

/** App entrypoints. */
export const WIRING_ENTRYPOINT_BASENAMES = ['server.ts', 'main.ts'] as const;

/** `.env`, `.env.local`, `.env.production`, etc. — anywhere `.env` appears. */
export const WIRING_ENV_INFIX = '.env';
