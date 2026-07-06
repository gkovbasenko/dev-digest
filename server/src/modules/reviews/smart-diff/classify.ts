import type { SmartDiffRole } from '@devdigest/shared';
import {
  BOILERPLATE_DIRS,
  BOILERPLATE_LOCKFILES,
  BOILERPLATE_LOCK_SUFFIX,
  BOILERPLATE_MAP_SUFFIX,
  BOILERPLATE_MIN_INFIX,
  BOILERPLATE_SNAPSHOT_DIR,
  BOILERPLATE_SNAP_SUFFIX,
  WIRING_CONFIG_RE,
  WIRING_ENTRYPOINT_BASENAMES,
  WIRING_ENV_INFIX,
  WIRING_GITHUB_DIR,
  WIRING_INDEX_BASENAMES,
  WIRING_PACKAGE_JSON,
  WIRING_TSCONFIG_PREFIX,
  WIRING_TSCONFIG_SUFFIX,
} from './constants.js';

/**
 * Smart Diff classifier (S2). Pure function of `path` only — no I/O, no
 * repo-map lookups. Follows the purity precedent of `intent/hunk-headers.ts`.
 *
 * Order matters: boilerplate is checked first (a lockfile living under a
 * config-ish directory is still boilerplate), then wiring, else core.
 */
export function classifyFile(path: string): SmartDiffRole {
  if (isBoilerplate(path)) return 'boilerplate';
  if (isWiring(path)) return 'wiring';
  return 'core';
}

function basename(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? path : path.slice(idx + 1);
}

function pathSegments(path: string): string[] {
  return path.split('/').filter(Boolean);
}

function isBoilerplate(path: string): boolean {
  const base = basename(path);
  const segments = pathSegments(path);

  if ((BOILERPLATE_LOCKFILES as readonly string[]).includes(base)) return true;
  if (base.endsWith(BOILERPLATE_LOCK_SUFFIX)) return true;
  if (segments.some((seg) => (BOILERPLATE_DIRS as readonly string[]).includes(seg))) return true;
  if (segments.includes(BOILERPLATE_SNAPSHOT_DIR)) return true;
  if (base.endsWith(BOILERPLATE_SNAP_SUFFIX)) return true;
  if (base.includes(BOILERPLATE_MIN_INFIX)) return true;
  if (base.endsWith(BOILERPLATE_MAP_SUFFIX)) return true;

  return false;
}

function isWiring(path: string): boolean {
  const base = basename(path);
  const segments = pathSegments(path);

  if (WIRING_CONFIG_RE.test(base)) return true;
  if (base.startsWith(WIRING_TSCONFIG_PREFIX) && base.endsWith(WIRING_TSCONFIG_SUFFIX)) return true;
  if (base === WIRING_PACKAGE_JSON) return true;
  if (segments.includes(WIRING_GITHUB_DIR)) return true;
  if ((WIRING_INDEX_BASENAMES as readonly string[]).includes(base)) return true;
  if ((WIRING_ENTRYPOINT_BASENAMES as readonly string[]).includes(base)) return true;
  if (base.includes(WIRING_ENV_INFIX)) return true;

  return false;
}
