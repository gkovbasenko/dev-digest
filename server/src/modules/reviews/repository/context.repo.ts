import { asc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';

// ---- Project Context attachments (agent + skill) → run-executor -----------
//
// Read-only, workspace-agnostic by construction (agentId/skillId already
// belong to the caller's workspace by the time run-executor has them — same
// trust boundary as `getEnabledAgentSkills`). Paths only; text is read fresh
// from the target PR's clone at run time (see run-executor.ts).

/** Attached Project Context doc paths for an agent, in `order` ascending. */
export async function getAgentContextDocs(
  db: Db,
  agentId: string,
): Promise<{ path: string; order: number }[]> {
  return db
    .select({ path: t.agentContextDocs.path, order: t.agentContextDocs.order })
    .from(t.agentContextDocs)
    .where(eq(t.agentContextDocs.agentId, agentId))
    .orderBy(asc(t.agentContextDocs.order));
}

/**
 * Attached Project Context doc paths for a SET of skills (batched — one query
 * for every enabled skill linked to the agent, not one per skill), flat rows
 * carrying `skillId` so the caller can group per-skill and apply the
 * skill's own doc order. `skillIds.length === 0` short-circuits to `[]`
 * without a query.
 */
export async function getSkillContextDocs(
  db: Db,
  skillIds: string[],
): Promise<{ skillId: string; path: string; order: number }[]> {
  if (skillIds.length === 0) return [];
  return db
    .select({
      skillId: t.skillContextDocs.skillId,
      path: t.skillContextDocs.path,
      order: t.skillContextDocs.order,
    })
    .from(t.skillContextDocs)
    .where(inArray(t.skillContextDocs.skillId, skillIds))
    .orderBy(asc(t.skillContextDocs.order));
}
