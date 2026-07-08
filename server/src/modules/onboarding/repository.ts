import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export type OnboardingRow = typeof t.onboarding.$inferSelect;

export interface UpsertOnboarding {
  repoId: string;
  json: unknown;
  generatedAt: Date;
  generationSha: string | null;
  sourceFileCount: number;
}

export class OnboardingRepository {
  constructor(private db: Db) {}

  async get(repoId: string): Promise<OnboardingRow | undefined> {
    const [row] = await this.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repoId));
    return row;
  }

  /** Single row per repo (PK `repoId`, AC-5) — overwrite on every regeneration. */
  async upsert(values: UpsertOnboarding): Promise<OnboardingRow> {
    const set = {
      json: values.json,
      generatedAt: values.generatedAt,
      generationSha: values.generationSha,
      sourceFileCount: values.sourceFileCount,
    };
    const [row] = await this.db
      .insert(t.onboarding)
      .values({ repoId: values.repoId, ...set })
      .onConflictDoUpdate({ target: t.onboarding.repoId, set })
      .returning();
    return row!;
  }

  /** Workspace-scoped clone-path lookup — mirrors ConventionsRepository.getRepoClonePath. */
  async getRepoClonePath(workspaceId: string, repoId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ clonePath: t.repos.clonePath })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row?.clonePath ?? null;
  }
}
