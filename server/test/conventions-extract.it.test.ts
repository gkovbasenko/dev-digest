import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[conventions-extract] Docker not available — skipping integration tests.');
}

const SAMPLE_PATH = 'src/modules/foo/service.ts';
const SAMPLE_CONTENT = [
  'export class FooService {',
  '  async list(): Promise<string[]> {',
  '    return [];',
  '  }',
  '}',
  '',
].join('\n');

const VALID_CANDIDATE = {
  rule: 'Service classes are named with a Service suffix',
  category: 'naming',
  evidence_path: SAMPLE_PATH,
  evidence_line: 1,
  evidence_snippet: 'export class FooService',
  confidence: 0.9,
};

const BAD_SNIPPET_CANDIDATE = {
  rule: 'A rule whose evidence snippet does not exist',
  category: 'naming',
  evidence_path: SAMPLE_PATH,
  evidence_line: 1,
  evidence_snippet: 'this text is not in the file',
  confidence: 0.5,
};

const MISSING_FILE_CANDIDATE = {
  rule: 'A rule citing a file that is not in the clone',
  category: 'naming',
  evidence_path: 'src/does/not/exist.ts',
  evidence_line: 1,
  evidence_snippet: 'anything',
  confidence: 0.5,
};

d('Conventions extraction lifecycle (POST extract / GET / PATCH / POST bundle)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    const s = await seed(pg.handle.db);
    workspaceId = s.workspaceId;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function makeRepoWithSamples(): Promise<{ repoId: string }> {
    const clonePath = await mkdtemp(join(tmpdir(), 'dd-conventions-'));
    await mkdir(join(clonePath, 'src/modules/foo'), { recursive: true });
    await writeFile(join(clonePath, SAMPLE_PATH), SAMPLE_CONTENT, 'utf8');

    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: `convtest-${Math.random().toString(36).slice(2)}`,
        fullName: `acme/convtest-${Math.random().toString(36).slice(2)}`,
        defaultBranch: 'main',
        clonePath,
      })
      .returning();
    const repoId = repo!.id;

    await pg.handle.db.insert(t.fileRank).values({
      repoId,
      filePath: SAMPLE_PATH,
      pagerank: 1,
      hotness: 0,
      rank: 1,
      percentile: 99,
    });

    return { repoId };
  }

  function makeApp(candidates: unknown[]) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        llm: { openai: new MockLLMProvider('openai', { structured: { candidates } }) },
      },
    });
  }

  it('extract drops candidates with unverifiable evidence, keeps the valid one', async () => {
    const { repoId } = await makeRepoWithSamples();
    const app = await makeApp([VALID_CANDIDATE, BAD_SNIPPET_CANDIDATE, MISSING_FILE_CANDIDATE]);

    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/extract`,
    });
    expect(res.statusCode).toBe(201);
    const created = res.json();
    expect(created).toHaveLength(1);
    expect(created[0].rule).toBe(VALID_CANDIDATE.rule);
    expect(created[0].evidence_path).toBe(SAMPLE_PATH);
    expect(created[0].accepted).toBe(false);
    expect(created[0].rejected).toBe(false);

    await app.close();
  });

  it('full lifecycle: extract -> list -> accept -> bundle', async () => {
    const { repoId } = await makeRepoWithSamples();
    const app = await makeApp([VALID_CANDIDATE]);

    const extracted = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/extract`,
    });
    expect(extracted.statusCode).toBe(201);
    const candidateId = extracted.json()[0].id;

    const list = await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toHaveLength(1);

    // bundling before anything is accepted is rejected
    const tooEarly = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/bundle`,
    });
    expect(tooEarly.statusCode).toBe(422);

    const accepted = await app.inject({
      method: 'PATCH',
      url: `/conventions/${candidateId}`,
      payload: { accepted: true },
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json().accepted).toBe(true);
    expect(accepted.json().rejected).toBe(false);

    const bundle = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/bundle`,
    });
    expect(bundle.statusCode).toBe(200);
    expect(bundle.json().name).toBe('repo-conventions');
    expect(bundle.json().type).toBe('convention');
    expect(bundle.json().body).toContain(VALID_CANDIDATE.rule);

    await app.close();
  });

  it('reject is soft (row kept, rejected_at set) and the rejected rule is not resurfaced on re-extraction', async () => {
    const { repoId } = await makeRepoWithSamples();
    const app = await makeApp([VALID_CANDIDATE]);

    const first = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/extract`,
    });
    const candidateId = first.json()[0].id;

    const rejected = await app.inject({
      method: 'PATCH',
      url: `/conventions/${candidateId}`,
      payload: { rejected: true },
    });
    expect(rejected.statusCode).toBe(200);
    expect(rejected.json().rejected).toBe(true);
    expect(rejected.json().accepted).toBe(false);

    // the row still exists (soft reject, not a delete)
    const afterReject = await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` });
    expect(afterReject.json()).toHaveLength(1);
    expect(afterReject.json()[0].id).toBe(candidateId);
    expect(afterReject.json()[0].rejected).toBe(true);

    // re-running extraction with the SAME candidate must not insert a duplicate
    const second = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/extract`,
    });
    expect(second.statusCode).toBe(201);
    expect(second.json()).toHaveLength(0);

    const afterSecond = await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` });
    expect(afterSecond.json()).toHaveLength(1);

    await app.close();
  });

  it('accepted and rejected are mutually exclusive', async () => {
    const { repoId } = await makeRepoWithSamples();
    const app = await makeApp([VALID_CANDIDATE]);

    const extracted = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/extract`,
    });
    const candidateId = extracted.json()[0].id;

    await app.inject({
      method: 'PATCH',
      url: `/conventions/${candidateId}`,
      payload: { accepted: true },
    });
    const flipped = await app.inject({
      method: 'PATCH',
      url: `/conventions/${candidateId}`,
      payload: { rejected: true },
    });
    expect(flipped.json().accepted).toBe(false);
    expect(flipped.json().rejected).toBe(true);

    await app.close();
  });

  it('POST /repos/:id/conventions/extract → validation error when the repo is not cloned', async () => {
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: `noclone-${Math.random().toString(36).slice(2)}`,
        fullName: `acme/noclone-${Math.random().toString(36).slice(2)}`,
        defaultBranch: 'main',
      })
      .returning();

    const app = await makeApp([VALID_CANDIDATE]);
    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repo!.id}/conventions/extract`,
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
    await app.close();
  });
});
