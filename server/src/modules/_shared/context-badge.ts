import { extname } from 'node:path';
import type { ContextBadge } from '@devdigest/shared';
import { ContextBadge as ContextBadgeSchema } from '@devdigest/shared';

/**
 * Shared "is this path a Project Context doc" contract — promoted so BOTH
 * the `context` module's discovery/preview AND the agents/skills
 * attach-validate path (`context-attach.ts`) enforce the identical rule
 * without cross-importing another module's internals (server CLAUDE.md
 * module-isolation rule).
 *
 * Discovery (`context/service.ts#discover`, via `walkClone`) only ever lists
 * `.md` files under one of the configured root folders — so any consumer
 * that reads an untrusted/stored path (preview, attach-validate, run-time
 * injection) must reject anything discovery would never have surfaced (S5),
 * rather than reading it. Otherwise `GET /repos/:id/context/file?path=.env`
 * (containment-checked but otherwise unrestricted) returns arbitrary
 * committed files, and a client could attach a non-`.md` path and have its
 * content injected straight into the reviewer prompt.
 */

/**
 * Derive the badge for a discovered `.md` doc: the NEAREST enclosing
 * ancestor folder (closest to the file, walking upward) that is one of the
 * configured root folder names. E.g. `deep/nested/insights/c.md` →
 * 'insights' (its immediate parent), not 'deep' or 'nested'. Returns null
 * (excluded from the list) when no ancestor matches.
 */
export function deriveBadge(relPath: string, roots: ReadonlySet<string>): ContextBadge | null {
  const segments = relPath.split('/');
  segments.pop(); // drop the filename itself
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i]!;
    if (!roots.has(seg)) continue;
    const parsed = ContextBadgeSchema.safeParse(seg);
    if (parsed.success) return parsed.data;
  }
  return null;
}

/**
 * Is `relPath` a path the Project Context discovery contract would ever
 * surface — a `.md` file under one of `roots` (i.e. `deriveBadge` resolves
 * a badge)? Used to reject preview/attach requests for anything discovery
 * would never have listed, even though the realpath containment check
 * alone would otherwise allow reading it.
 */
export function isAllowedContextPath(relPath: string, roots: ReadonlySet<string>): boolean {
  return extname(relPath).toLowerCase() === '.md' && deriveBadge(relPath, roots) !== null;
}
