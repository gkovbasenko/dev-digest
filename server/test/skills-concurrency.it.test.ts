import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, asc } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { SkillsRepository } from '../src/modules/skills/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills-concurrency] Docker not available — skipping integration tests.');
}

/**
 * Concurrent PUT /skills/:id must not silently drop a version snapshot.
 * update() reads the current version, bumps it, writes the row, then inserts
 * a skill_versions snapshot keyed on (skillId, version). Two overlapping
 * updates that both read the same starting version would otherwise both
 * compute the same next version, and the second snapshot insert would no-op
 * on the (skillId, version) conflict — losing that editor's body from history.
 */
d('SkillsRepository.update — concurrent writes', () => {
  let pg: PgFixture;
  let repo: SkillsRepository;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    const seeded = await seed(pg.handle.db);
    workspaceId = seeded.workspaceId;
    repo = new SkillsRepository(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('two concurrent body updates each get a distinct version with no dropped snapshot', async () => {
    const created = await repo.insert({
      workspaceId,
      name: 'Concurrency Test Skill',
      type: 'custom',
      source: 'manual',
      body: 'v1 body',
    });

    const [a, b] = await Promise.all([
      repo.update(workspaceId, created.id, { body: 'body from editor A' }),
      repo.update(workspaceId, created.id, { body: 'body from editor B' }),
    ]);

    expect(a).toBeDefined();
    expect(b).toBeDefined();
    // Both updates changed the body, so both must have bumped the version —
    // one to 2, the other to 3 (order between A/B is not guaranteed).
    expect([a!.version, b!.version].sort()).toEqual([2, 3]);

    const versions = await pg.handle.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, created.id))
      .orderBy(asc(t.skillVersions.version));

    // v1 (initial insert) + v2 + v3 — no version silently skipped.
    expect(versions.map((v) => v.version)).toEqual([1, 2, 3]);
    const bodiesByVersion = new Map(versions.map((v) => [v.version, v.body]));
    expect(bodiesByVersion.get(2)).toMatch(/^body from editor [AB]$/);
    expect(bodiesByVersion.get(3)).toMatch(/^body from editor [AB]$/);
    expect(bodiesByVersion.get(2)).not.toEqual(bodiesByVersion.get(3));
  });
});
