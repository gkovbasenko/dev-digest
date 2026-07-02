import { and, eq, desc, isNotNull } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export type { ConventionRow } from '../../db/rows.js';
import type { ConventionRow } from '../../db/rows.js';

export interface InsertConvention {
  workspaceId: string;
  repoId: string;
  rule: string;
  category: string | null;
  evidencePath: string | null;
  evidenceSnippet: string | null;
  evidenceLine: number | null;
  confidence: number | null;
}

export interface UpdateConvention {
  rule?: string;
  category?: string | null;
  accepted?: boolean;
  rejected?: boolean;
}

export class ConventionsRepository {
  constructor(private db: Db) {}

  async list(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)))
      .orderBy(desc(t.conventions.createdAt));
  }

  async listAccepted(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          isNotNull(t.conventions.acceptedAt),
        ),
      )
      .orderBy(desc(t.conventions.createdAt));
  }

  /** Normalized (lowercase+trim) `rule` text of every previously-rejected candidate for this repo. */
  async listRejectedRuleTexts(workspaceId: string, repoId: string): Promise<Set<string>> {
    const rows = await this.db
      .select({ rule: t.conventions.rule })
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          isNotNull(t.conventions.rejectedAt),
        ),
      );
    return new Set(rows.map((r) => r.rule.trim().toLowerCase()));
  }

  async insertMany(values: InsertConvention[]): Promise<ConventionRow[]> {
    if (values.length === 0) return [];
    return this.db
      .insert(t.conventions)
      .values(
        values.map((v) => ({
          workspaceId: v.workspaceId,
          repoId: v.repoId,
          rule: v.rule,
          category: v.category,
          evidencePath: v.evidencePath,
          evidenceSnippet: v.evidenceSnippet,
          evidenceLine: v.evidenceLine,
          confidence: v.confidence,
        })),
      )
      .returning();
  }

  async getById(workspaceId: string, id: string): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)));
    return row;
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateConvention,
  ): Promise<ConventionRow | undefined> {
    // accepted/rejected are mutually exclusive states — setting one true clears
    // the other, so a candidate can't end up both accepted and rejected.
    const set: Partial<typeof t.conventions.$inferInsert> = {};
    if (patch.rule !== undefined) set.rule = patch.rule;
    if (patch.category !== undefined) set.category = patch.category;
    if (patch.accepted !== undefined) {
      set.acceptedAt = patch.accepted ? new Date() : null;
      if (patch.accepted) set.rejectedAt = null;
    }
    if (patch.rejected !== undefined) {
      set.rejectedAt = patch.rejected ? new Date() : null;
      if (patch.rejected) set.acceptedAt = null;
    }

    const [row] = await this.db
      .update(t.conventions)
      .set(set)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row;
  }

  /** Workspace-scoped clone-path lookup — mirrors RepoIntelRepository.getRepoBasics but scoped by workspace. */
  async getRepoClonePath(workspaceId: string, repoId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ clonePath: t.repos.clonePath })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row?.clonePath ?? null;
  }
}
