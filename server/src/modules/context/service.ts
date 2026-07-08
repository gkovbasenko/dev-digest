import type { ContextDocList, ContextDocPreview, ContextDocument } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { walkClone } from '../_shared/clone-walk.js';
import { readCloneFile } from '../_shared/clone-read.js';
import { deriveBadge, isAllowedContextPath } from '../_shared/context-badge.js';
import { ContextRepository } from './repository.js';

const MD_EXTENSIONS: ReadonlySet<string> = new Set(['.md']);

// Re-exported for existing importers/tests — the implementation now lives in
// `_shared/context-badge.ts` so `context-attach.ts` (agents/skills
// attach-validate) can enforce the identical rule (S5) without cross-
// importing this module's internals.
export { deriveBadge };

export class ContextService {
  private repo: ContextRepository;

  constructor(private container: Container) {
    this.repo = new ContextRepository(container.db);
  }

  /**
   * Walk the repo's clone for `.md` docs under the configured root folders
   * (`PROJECT_CONTEXT_ROOTS`, default specs/docs/insights). Never throws for
   * an un-cloned repo — degrades to `{ indexed: false, documents: [] }`.
   */
  async discover(workspaceId: string, repoId: string): Promise<ContextDocList> {
    const clonePath = await this.repo.getRepoClonePath(workspaceId, repoId);
    if (!clonePath) return { indexed: false, documents: [] };

    const roots = new Set(this.container.config.projectContextRoots);
    const { files } = await walkClone(clonePath, { extensions: MD_EXTENSIONS });

    const documents: ContextDocument[] = [];
    for (const relPath of files) {
      const badge = deriveBadge(relPath, roots);
      if (!badge) continue;
      const content = await readCloneFile(clonePath, relPath);
      if (content == null) continue; // unreadable/vanished between walk and read
      documents.push({
        path: relPath,
        badge,
        token_count: this.container.tokenizer.count(content),
      });
    }

    return { indexed: true, documents };
  }

  /**
   * Read one doc's content through the realpath-contained boundary. The
   * client-supplied path is never trusted — containment is re-validated
   * here server-side, AND (S5) the path must match the discovery contract
   * exactly (`.md` under a configured root folder) before it's read at all.
   * Without this, containment alone would let `?path=.env` or any other
   * committed file be returned verbatim. Returns null on escape, miss,
   * disallowed path, or an un-cloned repo.
   */
  async preview(workspaceId: string, repoId: string, path: string): Promise<ContextDocPreview | null> {
    const clonePath = await this.repo.getRepoClonePath(workspaceId, repoId);
    if (!clonePath) return null;
    const roots = new Set(this.container.config.projectContextRoots);
    if (!isAllowedContextPath(path, roots)) return null;
    const content = await readCloneFile(clonePath, path);
    if (content == null) return null;
    return { content };
  }
}
