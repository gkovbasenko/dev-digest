import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigError } from '../../platform/errors.js';

/**
 * Isolates the ONE filesystem read `ci/` needs (`agent-runner/dist/index.js`)
 * so `manifest.ts`/`workflow.ts`/`bundle.ts` stay pure (AC-33). The bundle is
 * ncc-compiled and gitignored — a build prerequisite, not a contract change
 * (see the plan's "Runner-bundle provenance" decision). Tests never hit this
 * function; they inject a stub bundle string directly into `buildBundle`.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
// server/{src,dist}/modules/ci -> repo root -> agent-runner/dist/index.js.
// "src" and "dist" sit at the same depth under server/, so this resolves
// correctly under both `tsx` (src) and the compiled build (dist).
const DEFAULT_RUNNER_BUNDLE_PATH = path.resolve(here, '../../../../agent-runner/dist/index.js');

export function readRunnerBundle(bundlePath: string = DEFAULT_RUNNER_BUNDLE_PATH): string {
  try {
    return readFileSync(bundlePath, 'utf8');
  } catch (err) {
    throw new ConfigError(
      `agent-runner bundle not built — run \`cd agent-runner && pnpm build\` (looked for ${bundlePath})`,
      { cause: (err as Error).message },
    );
  }
}
