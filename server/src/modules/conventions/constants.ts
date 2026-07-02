/** Config files read explicitly for extraction — repoIntel's source samples deliberately exclude these. */
export const CONFIG_FILE_CANDIDATES = [
  '.eslintrc.json',
  '.eslintrc.js',
  '.eslintrc.cjs',
  'eslint.config.js',
  'eslint.config.mjs',
  'tsconfig.json',
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.js',
  'prettier.config.js',
  'prettier.config.mjs',
];

/** Top-N ranked source files sampled per extraction run. */
export const SOURCE_SAMPLE_COUNT = 12;

/** Lines of context read around a claimed evidence line when verifying it. */
export const EVIDENCE_WINDOW = 3;
