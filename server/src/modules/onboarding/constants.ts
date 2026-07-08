/** Fixed section kinds, in the required generation/render order (AC-3). */
export const ONBOARDING_SECTION_KINDS = [
  'architecture',
  'critical_paths',
  'how_to_run',
  'guided_reading',
  'first_tasks',
] as const;

/**
 * Filenames read (unconditionally, via the containment reader) as key-file
 * excerpts for the generation prompt — the repo-root docs/manifests a human
 * would open first. Mirrors conventions' `CONFIG_FILE_CANDIDATES` shape.
 */
export const KEY_FILE_CANDIDATES = [
  'README.md',
  'package.json',
  'pnpm-workspace.yaml',
  'docker-compose.yml',
  'docker-compose.yaml',
  'tsconfig.json',
  'Makefile',
  '.env.example',
];

/** Top-N ranked source files sampled per generation run. */
export const TOP_FILE_COUNT = 12;

/**
 * Per-file character cap for key-file excerpts fed to the prompt — bounds the
 * prompt to a fixed size regardless of a huge README/manifest in the repo.
 * Approximates a byte cap for typical UTF-8 source/doc text.
 */
export const KEY_FILE_EXCERPT_MAX_CHARS = 4000;
