import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';

// ---- agent skills (enabled only) → review prompt --------------------------

/**
 * Enabled skills linked to an agent, in `order` ascending. Only `enabled:
 * true` skills are returned — the SQL filter is the enforcement point for the
 * "only vetted skills reach the prompt" boundary (see server/INSIGHTS.md,
 * 2026-07-01 — `assemblePrompt`'s `skills` param is NOT delimiter-wrapped).
 */
export async function getEnabledAgentSkills(
  db: Db,
  agentId: string,
): Promise<{ id: string; version: number; body: string }[]> {
  const rows = await db
    .select({ id: t.skills.id, version: t.skills.version, body: t.skills.body })
    .from(t.agentSkills)
    .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
    .where(and(eq(t.agentSkills.agentId, agentId), eq(t.skills.enabled, true)))
    .orderBy(asc(t.agentSkills.order));
  return rows;
}

// ---- run_skills (usage/audit trail) ---------------------------------------

/** Record which skills (+ the version consumed) fed a given review run. */
export async function recordRunSkills(
  db: Db,
  runId: string,
  skills: { id: string; version: number }[],
): Promise<void> {
  if (skills.length === 0) return;
  await db
    .insert(t.runSkills)
    .values(skills.map((s) => ({ runId, skillId: s.id, version: s.version })))
    .onConflictDoNothing();
}
