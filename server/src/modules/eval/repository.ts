import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { EvalCaseResult, EvalOwnerKind } from '@devdigest/shared';

/**
 * A4 — eval data-access. Owns `eval_cases` and `eval_runs`. `eval_cases` is
 * workspace-scoped directly; `eval_runs` carries NO `workspace_id` column (a
 * polymorphic owner with no FK — the owning agent may be deleted, spec edge
 * case), so run queries are scoped by `(owner_kind, owner_id)` — the caller
 * (service.ts) is responsible for having already checked that owner belongs
 * to the caller's workspace (e.g. via `container.agentsRepo.getById`).
 */

export type EvalCaseRow = typeof t.evalCases.$inferSelect;
export type EvalRunRow = typeof t.evalRuns.$inferSelect;

export interface InsertEvalCase {
  workspaceId: string;
  ownerKind: EvalOwnerKind;
  ownerId: string;
  name: string;
  inputDiff?: string;
  inputFiles?: unknown;
  inputMeta?: unknown;
  expectedOutput?: unknown;
  notes?: string | null;
  sourceFindingId?: string | null;
}

export interface UpdateEvalCase {
  name?: string;
  inputDiff?: string;
  inputFiles?: unknown;
  inputMeta?: unknown;
  expectedOutput?: unknown;
  notes?: string | null;
}

export interface InsertEvalRun {
  ownerId: string;
  ownerKind: EvalOwnerKind;
  ownerVersion: number;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  tracesPassed: number;
  tracesTotal: number;
  caseResults: EvalCaseResult[];
  durationMs: number;
  costUsd: number | null;
}

export class EvalRepository {
  constructor(private db: Db) {}

  // ---- eval_cases (workspace-scoped) --------------------------------------

  async listByOwner(
    workspaceId: string,
    ownerKind: EvalOwnerKind,
    ownerId: string,
  ): Promise<EvalCaseRow[]> {
    return this.db
      .select()
      .from(t.evalCases)
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.ownerKind, ownerKind),
          eq(t.evalCases.ownerId, ownerId),
        ),
      );
  }

  async getCase(workspaceId: string, id: string): Promise<EvalCaseRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, id)));
    return row;
  }

  /** De-dupe key for "Turn into eval case" — a re-click on the same finding
   *  returns the already-created case instead of creating a duplicate. */
  async findBySourceFinding(
    workspaceId: string,
    sourceFindingId: string,
  ): Promise<EvalCaseRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalCases)
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.sourceFindingId, sourceFindingId),
        ),
      );
    return row;
  }

  async insertCase(values: InsertEvalCase): Promise<EvalCaseRow> {
    const [row] = await this.db
      .insert(t.evalCases)
      .values({
        workspaceId: values.workspaceId,
        ownerKind: values.ownerKind,
        ownerId: values.ownerId,
        name: values.name,
        inputDiff: values.inputDiff ?? '',
        inputFiles: (values.inputFiles as object | undefined) ?? null,
        inputMeta: (values.inputMeta as object | undefined) ?? null,
        expectedOutput: (values.expectedOutput as object | undefined) ?? null,
        notes: values.notes ?? null,
        sourceFindingId: values.sourceFindingId ?? null,
      })
      .returning();
    return row!;
  }

  async updateCase(
    workspaceId: string,
    id: string,
    patch: UpdateEvalCase,
  ): Promise<EvalCaseRow | undefined> {
    const [row] = await this.db
      .update(t.evalCases)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.inputDiff !== undefined ? { inputDiff: patch.inputDiff } : {}),
        ...(patch.inputFiles !== undefined ? { inputFiles: patch.inputFiles as object } : {}),
        ...(patch.inputMeta !== undefined ? { inputMeta: patch.inputMeta as object } : {}),
        ...(patch.expectedOutput !== undefined
          ? { expectedOutput: patch.expectedOutput as object }
          : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      })
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, id)))
      .returning();
    return row;
  }

  async deleteCase(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, id)))
      .returning({ id: t.evalCases.id });
    return rows.length > 0;
  }

  async casesCountForOwner(
    workspaceId: string,
    ownerKind: EvalOwnerKind,
    ownerId: string,
  ): Promise<number> {
    const rows = await this.listByOwner(workspaceId, ownerKind, ownerId);
    return rows.length;
  }

  // ---- eval_runs (owner-scoped — see class doc) ---------------------------

  async insertRun(values: InsertEvalRun): Promise<EvalRunRow> {
    const [row] = await this.db
      .insert(t.evalRuns)
      .values({
        ownerId: values.ownerId,
        ownerKind: values.ownerKind,
        ownerVersion: values.ownerVersion,
        recall: values.recall,
        precision: values.precision,
        citationAccuracy: values.citationAccuracy,
        tracesPassed: values.tracesPassed,
        tracesTotal: values.tracesTotal,
        caseResults: values.caseResults,
        durationMs: values.durationMs,
        costUsd: values.costUsd,
      })
      .returning();
    return row!;
  }

  /** Runs for one owner, newest first. */
  async runsForOwner(
    ownerKind: EvalOwnerKind,
    ownerId: string,
    limit?: number,
  ): Promise<EvalRunRow[]> {
    const q = this.db
      .select()
      .from(t.evalRuns)
      .where(and(eq(t.evalRuns.ownerKind, ownerKind), eq(t.evalRuns.ownerId, ownerId)))
      .orderBy(desc(t.evalRuns.ranAt));
    return limit ? q.limit(limit) : q;
  }

  /** Runs across several owners (workspace-wide dashboard), newest first. */
  async runsForOwners(ownerKind: EvalOwnerKind, ownerIds: string[]): Promise<EvalRunRow[]> {
    if (ownerIds.length === 0) return [];
    return this.db
      .select()
      .from(t.evalRuns)
      .where(and(eq(t.evalRuns.ownerKind, ownerKind), inArray(t.evalRuns.ownerId, ownerIds)))
      .orderBy(desc(t.evalRuns.ranAt));
  }

  async getRun(id: string): Promise<EvalRunRow | undefined> {
    const [row] = await this.db.select().from(t.evalRuns).where(eq(t.evalRuns.id, id));
    return row;
  }
}
