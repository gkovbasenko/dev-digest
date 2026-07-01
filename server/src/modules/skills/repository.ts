import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SkillType, SkillSource } from '@devdigest/shared';
import { INITIAL_SKILL_VERSION } from './constants.js';

export type { SkillRow, SkillVersionRow } from '../../db/rows.js';
import type { SkillRow } from '../../db/rows.js';

export interface InsertSkill {
  workspaceId: string;
  name: string;
  description?: string;
  type: SkillType;
  source: SkillSource;
  body: string;
  enabled?: boolean;
}

export interface UpdateSkill {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
}

export class SkillsRepository {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<SkillRow[]> {
    return this.db
      .select()
      .from(t.skills)
      .where(eq(t.skills.workspaceId, workspaceId))
      .orderBy(asc(t.skills.createdAt));
  }

  async getById(workspaceId: string, id: string): Promise<SkillRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row;
  }

  async insert(values: InsertSkill): Promise<SkillRow> {
    const [row] = await this.db
      .insert(t.skills)
      .values({
        workspaceId: values.workspaceId,
        name: values.name,
        description: values.description ?? '',
        type: values.type,
        source: values.source,
        body: values.body,
        enabled: values.enabled ?? true,
        version: INITIAL_SKILL_VERSION,
      })
      .returning();
    await this.snapshotVersion(row!.id, INITIAL_SKILL_VERSION, row!.body);
    return row!;
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkill,
  ): Promise<SkillRow | undefined> {
    // Two concurrent PUTs on the same skill would otherwise both read the same
    // `existing.version`, both compute the same `nextVersion`, and the second
    // version-snapshot insert would silently no-op on the (skillId, version)
    // conflict — dropping one editor's body from history. SELECT ... FOR UPDATE
    // inside a transaction serializes concurrent updates on this row so the
    // second transaction sees the first's already-incremented version.
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(t.skills)
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
        .for('update');
      if (!existing) return undefined;

      const bodyChanged = patch.body !== undefined && patch.body !== existing.body;
      const nextVersion = bodyChanged ? existing.version + 1 : existing.version;

      // Optimistic-lock guard (eq(version, existing.version)) as a second line
      // of defense alongside the FOR UPDATE lock above: under correct code this
      // can never fail to match (the lock guarantees no other writer could have
      // changed the row's version since we read `existing` moments ago in this
      // same transaction). If a future refactor ever calls update() outside a
      // transaction, or the lock is otherwise bypassed, this WHERE clause turns
      // a silent lost-update into a detectable zero-row UPDATE instead.
      const [row] = await tx
        .update(t.skills)
        .set({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.type !== undefined ? { type: patch.type } : {}),
          ...(patch.body !== undefined ? { body: patch.body } : {}),
          ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
          ...(bodyChanged ? { version: nextVersion } : {}),
        })
        .where(
          and(
            eq(t.skills.workspaceId, workspaceId),
            eq(t.skills.id, id),
            eq(t.skills.version, existing.version),
          ),
        )
        .returning();

      if (!row) {
        // Should be unreachable under the FOR UPDATE lock above — see comment.
        console.error(
          `[skills] optimistic-lock mismatch: skill ${id} was expected to still be at version ${existing.version} but the UPDATE matched zero rows. This should be unreachable under the SELECT ... FOR UPDATE lock in SkillsRepository.update(); investigate immediately.`,
        );
        return undefined;
      }

      if (bodyChanged) {
        const inserted = await tx
          .insert(t.skillVersions)
          .values({ skillId: row.id, version: nextVersion, body: row.body })
          .onConflictDoNothing()
          .returning({ version: t.skillVersions.version });
        if (inserted.length === 0) {
          // Should be unreachable: the SELECT ... FOR UPDATE above serializes
          // concurrent writers, so no two transactions should ever compute the
          // same nextVersion for the same skill. If this ever fires, the
          // locking above has regressed and a version snapshot is being
          // silently dropped again — surface it loudly.
          console.error(
            `[skills] snapshotVersion conflict: skill ${row.id} version ${nextVersion} already existed — a version snapshot was NOT written. This should be unreachable under the SELECT ... FOR UPDATE lock in SkillsRepository.update(); investigate immediately.`,
          );
        }
      }
      return row;
    });
  }

  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  private async snapshotVersion(skillId: string, version: number, body: string): Promise<void> {
    await this.db
      .insert(t.skillVersions)
      .values({ skillId, version, body })
      .onConflictDoNothing();
  }
}
