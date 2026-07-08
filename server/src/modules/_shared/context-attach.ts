import { PER_DOC_TOKEN_CAP, AGGREGATE_TOKEN_CAP } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { ValidationError } from '../../platform/errors.js';
import { readCloneFile } from './clone-read.js';
import { isAllowedContextPath } from './context-badge.js';

/**
 * Validate a submitted ordered path list against the Project Context caps
 * before persisting an agent/skill attachment (T5, AC-13/14). Shared by
 * `agents/service.ts` and `skills/service.ts` — both do the identical
 * read-through-the-contained-boundary + cap check.
 *
 * Reads each path fresh through the realpath-contained boundary (never
 * trusts the client's list — the doc could have been deleted/moved since
 * discovery, or a client could submit an arbitrary path). Throws
 * `ValidationError` (→ 422) on the FIRST failure found — a path that isn't a
 * `.md` file under a configured root (S5, matches the discovery contract
 * exactly), a path that's missing/unreadable/escapes the clone, a single doc
 * over `PER_DOC_TOKEN_CAP`, or the aggregate over `AGGREGATE_TOKEN_CAP` — so
 * the caller persists nothing.
 */
export async function validateContextAttachment(
  container: Container,
  clonePath: string,
  paths: string[],
): Promise<void> {
  const roots = new Set(container.config.projectContextRoots);
  let total = 0;
  for (const path of paths) {
    if (!isAllowedContextPath(path, roots)) {
      throw new ValidationError(
        `${path} is not a valid Project Context document — must be a .md file under a configured root folder`,
      );
    }
    const content = await readCloneFile(clonePath, path);
    if (content == null) {
      throw new ValidationError(`Document not found or unreadable: ${path}`);
    }
    const tokenCount = container.tokenizer.count(content);
    if (tokenCount > PER_DOC_TOKEN_CAP) {
      throw new ValidationError(
        `${path} is ~${tokenCount} tokens, over the ${PER_DOC_TOKEN_CAP}-token per-doc cap`,
      );
    }
    total += tokenCount;
  }
  if (total > AGGREGATE_TOKEN_CAP) {
    throw new ValidationError(
      `Attached docs total ~${total} tokens, over the ${AGGREGATE_TOKEN_CAP}-token aggregate cap`,
    );
  }
}
