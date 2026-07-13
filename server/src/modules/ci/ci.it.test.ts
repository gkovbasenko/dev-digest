import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from '../../../test/helpers/pg.js';
import { loadConfig } from '../../platform/config.js';
import { Container } from '../../platform/container.js';
import { seed } from '../../db/seed.js';
import { MockGitHubClient } from '../../adapters/mocks.js';
import * as t from '../../db/schema.js';
import type { Db } from '../../db/client.js';
import { CI_BRANCH } from './constants.js';
import { CiService } from './service.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[ci] Docker not available — skipping integration tests.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

async function makeAgent(
  db: Db,
  workspaceId: string,
  overrides: Partial<{ name: string; ciFailOn: 'never' | 'critical' | 'warning' | 'any' }> = {},
) {
  const [row] = await db
    .insert(t.agents)
    .values({
      workspaceId,
      name: overrides.name ?? 'Security Reviewer',
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4-flash',
      systemPrompt: 'Review the diff.',
      ciFailOn: overrides.ciFailOn ?? 'critical',
    })
    .returning();
  return row!;
}

async function makeSkill(
  db: Db,
  workspaceId: string,
  agentId: string,
  name: string,
  body: string,
  enabled: boolean,
  order: number,
) {
  const [skill] = await db
    .insert(t.skills)
    .values({ workspaceId, name, description: '', type: 'custom', source: 'manual', body, enabled })
    .returning();
  await db.insert(t.agentSkills).values({ agentId, skillId: skill!.id, order });
  return skill!;
}

d('CiService.export (AC-1, 3, 13-18)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    const seeded = await seed(pg.handle.db);
    workspaceId = seeded.workspaceId;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('action="files" returns the bundle with pr_url=null and makes ZERO GitHub writes (AC-1/AC-3)', async () => {
    const agent = await makeAgent(pg.handle.db, workspaceId, { name: 'Files-Only Agent' });
    await makeSkill(pg.handle.db, workspaceId, agent.id, 'Convention checks', 'Check naming conventions.', true, 0);
    await makeSkill(pg.handle.db, workspaceId, agent.id, 'Unvetted skill', 'Not yet reviewed.', false, 1);

    const gh = new MockGitHubClient();
    const container = new Container(config(), pg.handle.db, { github: gh });
    const service = new CiService(container);

    const result = await service.export(workspaceId, agent.id, {
      repo: 'acme/widgets',
      target: 'gha',
      action: 'files',
      post_as: 'github_review',
      triggers: ['opened'],
      base: 'main',
    });

    expect(result).toBeDefined();
    expect(result?.pr_url).toBeNull();
    expect(gh.committed).toHaveLength(0);
    expect(gh.openedPrs).toHaveLength(0);

    // Manifest + exactly one skill file (the disabled one never leaves trusted territory).
    const manifestFile = result!.files.find((f) => f.path.startsWith('.devdigest/agents/'));
    expect(manifestFile).toBeDefined();
    const skillFiles = result!.files.filter((f) => f.path.startsWith('.devdigest/skills/'));
    expect(skillFiles).toHaveLength(1);
    expect(skillFiles[0]!.contents).toBe('Check naming conventions.');

    const memoryFile = result!.files.find((f) => f.path === '.devdigest/memory.jsonl');
    expect(memoryFile?.contents).toBe('');

    const runnerFile = result!.files.find((f) => f.path === '.devdigest/runner/index.js');
    expect(runnerFile?.editable).toBe(false);
    expect(runnerFile?.contents.length).toBeGreaterThan(0);

    // Installation is still persisted even though action='files' made no GitHub write.
    expect(result?.installation.repo).toBe('acme/widgets');
    expect(result?.installation.agent_id).toBe(agent.id);
  });

  it('action="open_pr" commits ONCE to devdigest/ci (never base) and opens a PR (AC-13/14/15)', async () => {
    const agent = await makeAgent(pg.handle.db, workspaceId, { name: 'Open-PR Agent' });
    const gh = new MockGitHubClient();
    const container = new Container(config(), pg.handle.db, { github: gh });
    const service = new CiService(container);

    const result = await service.export(workspaceId, agent.id, {
      repo: 'acme/widgets',
      target: 'gha',
      action: 'open_pr',
      post_as: 'github_review',
      triggers: ['opened', 'synchronize', 'reopened'],
      base: 'main',
    });

    expect(gh.committed).toHaveLength(1);
    expect(gh.committed[0]!.branch).toBe(CI_BRANCH);
    expect(gh.committed[0]!.branch).not.toBe('main');
    expect(gh.committed[0]!.base).toBe('main');
    expect(gh.openedPrs).toHaveLength(1);
    expect(result?.pr_url).toBe('https://github.com/mock/mock/pull/1');
  });

  it('a re-export reuses the already-open PR instead of opening a second one (AC-16)', async () => {
    const agent = await makeAgent(pg.handle.db, workspaceId, { name: 'Reuse-PR Agent' });
    const gh = new MockGitHubClient();
    const container = new Container(config(), pg.handle.db, { github: gh });
    const service = new CiService(container);

    const input = {
      repo: 'acme/reuse-repo',
      target: 'gha' as const,
      action: 'open_pr' as const,
      post_as: 'github_review' as const,
      triggers: ['opened'],
      base: 'main',
    };
    await service.export(workspaceId, agent.id, input);
    await service.export(workspaceId, agent.id, input);

    expect(gh.committed).toHaveLength(2); // re-publish still commits a fresh commit...
    expect(gh.openedPrs).toHaveLength(1); // ...but does not open a second PR.
  });

  it('export upserts ONE installation per (agent, repo) — a second export updates, not duplicates (AC-17/18)', async () => {
    const agent = await makeAgent(pg.handle.db, workspaceId, { name: 'Upsert Agent' });
    const gh = new MockGitHubClient();
    const container = new Container(config(), pg.handle.db, { github: gh });
    const service = new CiService(container);

    const first = await service.export(workspaceId, agent.id, {
      repo: 'acme/upsert-repo',
      target: 'gha',
      action: 'files',
      post_as: 'github_review',
      triggers: ['opened'],
      base: 'main',
    });
    const second = await service.export(workspaceId, agent.id, {
      repo: 'acme/upsert-repo',
      target: 'gha',
      action: 'files',
      post_as: 'github_review',
      triggers: ['opened'],
      base: 'main',
    });

    expect(first?.installation.id).toBe(second?.installation.id);
    const rows = await pg.handle.db
      .select()
      .from(t.ciInstallations)
      .where(eq(t.ciInstallations.agentId, agent.id));
    expect(rows).toHaveLength(1);
  });

  it('returns undefined for an unknown agent (workspace-scoped 404 at the service boundary)', async () => {
    const gh = new MockGitHubClient();
    const container = new Container(config(), pg.handle.db, { github: gh });
    const service = new CiService(container);
    const result = await service.export(workspaceId, '00000000-0000-0000-0000-000000000000', {
      repo: 'acme/widgets',
      target: 'gha',
      action: 'files',
      post_as: 'github_review',
      triggers: ['opened'],
      base: 'main',
    });
    expect(result).toBeUndefined();
  });
});

/**
 * Ingest exact-count assertions ([valid, invalid, valid] → exactly 2 rows,
 * idempotent re-run → 0 new rows) each get their OWN isolated Postgres
 * instance. `MockGitHubClient.listWorkflowRuns`/`downloadArtifact` return the
 * SAME canned fixture regardless of which repo/installation asks (it doesn't
 * branch on the `repo` param) — sharing a workspace/DB with any other
 * export/ingest test would make `ingest()` (which iterates EVERY installation
 * in the workspace) re-process unrelated installations against this test's
 * fixture too, inflating the aggregate ingested/skipped counts these tests
 * assert on exactly.
 */
d('CiService.ingest (AC-20, 21, 22, 23, 24)', () => {
  it('a [valid, invalid, valid] artifact batch yields exactly 2 new ci_runs rows', async () => {
    const pg = await startPg();
    try {
      const { workspaceId } = await seed(pg.handle.db);
      const agent = await makeAgent(pg.handle.db, workspaceId, { name: 'Ingest Agent' });
      const gh = new MockGitHubClient({
        workflowRuns: [
          { id: 5001, status: 'completed', conclusion: 'success', prNumber: 10, htmlUrl: 'https://x/1' },
          { id: 5002, status: 'completed', conclusion: 'success', prNumber: 11, htmlUrl: 'https://x/2' },
          { id: 5003, status: 'completed', conclusion: 'failure', prNumber: 12, htmlUrl: 'https://x/3' },
        ],
        artifacts: {
          5001: {
            'devdigest-result': JSON.stringify({
              findings_count: 2,
              cost_usd: 0.01,
              agent: 'Ingest Agent',
              version: '1',
              pr_number: 10,
            }),
          },
          5002: { 'devdigest-result': '{ not valid json ' },
          5003: {
            'devdigest-result': JSON.stringify({
              findings_count: 1,
              cost_usd: 0.02,
              agent: 'Ingest Agent',
              version: '1',
              pr_number: 12,
            }),
          },
        },
      });
      const container = new Container(config(), pg.handle.db, { github: gh });
      const service = new CiService(container);

      await service.export(workspaceId, agent.id, {
        repo: 'acme/ingest-repo',
        target: 'gha',
        action: 'files',
        post_as: 'github_review',
        triggers: ['opened'],
        base: 'main',
      });

      const outcome = await service.ingest(workspaceId);
      expect(outcome.ingested).toBe(2);
      expect(outcome.skipped).toBe(1);

      const rows = await service.listRunsForAgent(workspaceId, agent.id);
      expect(rows).toHaveLength(2);
      const byGithubUrl = new Map(rows!.map((r) => [r.github_url, r]));
      expect(byGithubUrl.get('https://x/1')?.status).toBe('succeeded');
      expect(byGithubUrl.get('https://x/1')?.findings_count).toBe(2);
      expect(byGithubUrl.get('https://x/1')?.source).toBe('1'); // ingested runner version (AC-23)
      expect(byGithubUrl.get('https://x/3')?.status).toBe('failed');
      expect(byGithubUrl.get('https://x/2')).toBeUndefined(); // malformed artifact never got a row
    } finally {
      await pg.stop();
    }
  });

  it('is idempotent: re-running does not duplicate an already-ingested run', async () => {
    const pg = await startPg();
    try {
      const { workspaceId } = await seed(pg.handle.db);
      const agent = await makeAgent(pg.handle.db, workspaceId, { name: 'Idempotent Ingest Agent' });
      const gh = new MockGitHubClient({
        workflowRuns: [
          { id: 6001, status: 'completed', conclusion: 'success', prNumber: 20, htmlUrl: 'https://x/idem' },
        ],
        artifacts: {
          6001: {
            'devdigest-result': JSON.stringify({
              findings_count: 0,
              cost_usd: 0,
              agent: 'Idempotent Ingest Agent',
              version: '1',
              pr_number: 20,
            }),
          },
        },
      });
      const container = new Container(config(), pg.handle.db, { github: gh });
      const service = new CiService(container);

      await service.export(workspaceId, agent.id, {
        repo: 'acme/idempotent-repo',
        target: 'gha',
        action: 'files',
        post_as: 'github_review',
        triggers: ['opened'],
        base: 'main',
      });

      const first = await service.ingest(workspaceId);
      const second = await service.ingest(workspaceId);
      expect(first.ingested).toBe(1);
      expect(second.ingested).toBe(0);
      expect(second.skipped).toBe(1);

      const rows = await service.listRunsForAgent(workspaceId, agent.id);
      expect(rows).toHaveLength(1);
      expect(rows![0]!.status).toBe('no_findings');
    } finally {
      await pg.stop();
    }
  });

  it('a still-running workflow is persisted as "running", never reads/logs a secret value (AC-24)', async () => {
    const pg = await startPg();
    try {
      const { workspaceId } = await seed(pg.handle.db);
      const agent = await makeAgent(pg.handle.db, workspaceId, { name: 'Secret-Safe Agent' });
      const gh = new MockGitHubClient({
        workflowRuns: [
          { id: 7001, status: 'in_progress', conclusion: null, prNumber: 30, htmlUrl: 'https://x/running' },
        ],
      });
      const container = new Container(config(), pg.handle.db, { github: gh });
      const service = new CiService(container);

      await service.export(workspaceId, agent.id, {
        repo: 'acme/running-repo',
        target: 'gha',
        action: 'files',
        post_as: 'github_review',
        triggers: ['opened'],
        base: 'main',
      });

      const outcome = await service.ingest(workspaceId);
      expect(outcome.ingested).toBe(1);

      const rows = await service.listRunsForAgent(workspaceId, agent.id);
      expect(rows).toHaveLength(1);
      expect(rows![0]!.status).toBe('running');
      expect(JSON.stringify(rows)).not.toMatch(/sk-|ghp_|gho_|Bearer /);
    } finally {
      await pg.stop();
    }
  });
});
