import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/** Minimal read-only repository for the Project Context discovery module. */
export class ContextRepository {
  constructor(private db: Db) {}

  /** Null when the repo doesn't exist in this workspace, OR isn't cloned yet. */
  async getRepoClonePath(workspaceId: string, repoId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ clonePath: t.repos.clonePath })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row?.clonePath ?? null;
  }
}
