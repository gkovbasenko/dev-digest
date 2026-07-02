import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink } from 'node:fs/promises';
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

// A real file OUTSIDE the clone directory with content that would satisfy
// verifyEvidence if the path traversal were followed — proves the
// containment check runs before the read, not just that missing files 404.
const SECRET_OUTSIDE_CONTENT = 'SECRET_TOKEN_12345\n';
const TRAVERSAL_CANDIDATE = {
  rule: 'A rule citing evidence outside the clone directory (path traversal)',
  category: 'naming',
  evidence_path: '../secret-outside.txt',
  evidence_line: 1,
  evidence_snippet: 'SECRET_TOKEN_12345',
  confidence: 0.9,
};

const SYMLINK_CANDIDATE = {
  rule: 'A rule citing a symlinked evidence path escaping the clone',
  category: 'naming',
  evidence_path: 'evil-link.txt',
  evidence_line: 1,
  evidence_snippet: 'SECRET_TOKEN_12345',
  confidence: 0.9,
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

  async function makeRepoWithSamples(): Promise<{ repoId: string; clonePath: string }> {
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

    return { repoId, clonePath };
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

  it('drops a candidate whose evidence_path attempts to traverse outside the clone directory', async () => {
    const { repoId, clonePath } = await makeRepoWithSamples();
    // Plant a real file one level above the clone with content that would
    // satisfy verifyEvidence if the traversal path were actually followed —
    // proves the containment check runs before the read, not that the path
    // just happens not to exist.
    await writeFile(join(clonePath, '..', 'secret-outside.txt'), SECRET_OUTSIDE_CONTENT, 'utf8');

    const app = await makeApp([TRAVERSAL_CANDIDATE]);
    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/extract`,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toHaveLength(0);

    const list = await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` });
    expect(list.json()).toHaveLength(0);

    await app.close();
  });

  it('drops a candidate whose evidence_path is a symlink escaping the clone directory', async () => {
    // resolveClonePath alone is syntactic (no filesystem access) — it can't
    // catch a symlink planted INSIDE the clone that points OUTSIDE it. git
    // supports committing symlinks (mode 120000); checkout materializes them
    // as real ones. Prove resolveRealClonePath's realpath-based check closes
    // this specific gap, distinct from the string-traversal case above.
    const { repoId, clonePath } = await makeRepoWithSamples();
    const outsideDir = await mkdtemp(join(tmpdir(), 'dd-outside-'));
    const secretPath = join(outsideDir, 'secret.txt');
    await writeFile(secretPath, SECRET_OUTSIDE_CONTENT, 'utf8');
    await symlink(secretPath, join(clonePath, 'evil-link.txt'));

    const app = await makeApp([SYMLINK_CANDIDATE]);
    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/extract`,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toHaveLength(0);

    const list = await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` });
    expect(list.json()).toHaveLength(0);

    await app.close();
  });

  it('never sends a symlinked config file\'s off-clone content to the LLM (unconditional sample read, no candidate involved)', async () => {
    // The MOST severe form of this bug: readSampled() reads every
    // CONFIG_FILE_CANDIDATES filename unconditionally while building the
    // prompt — no LLM cooperation or evidence_path needed at all. If
    // tsconfig.json in a malicious repo were a symlink to, say, a .env file,
    // its content would flow straight into the third-party LLM API call.
    const { repoId, clonePath } = await makeRepoWithSamples();
    const outsideDir = await mkdtemp(join(tmpdir(), 'dd-outside-'));
    const secretPath = join(outsideDir, 'secret.txt');
    await writeFile(secretPath, SECRET_OUTSIDE_CONTENT, 'utf8');
    await symlink(secretPath, join(clonePath, 'tsconfig.json'));

    const llm = new MockLLMProvider('openai', { structured: { candidates: [] } });
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        llm: { openai: llm },
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/extract`,
    });
    expect(res.statusCode).toBe(201);

    const structuredCall = llm.calls.find((c) => c.method === 'completeStructured');
    expect(structuredCall).toBeDefined();
    const promptText = JSON.stringify(structuredCall!.req);
    expect(promptText).not.toContain('SECRET_TOKEN_12345');

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

  it('re-extraction filters a rejected rule even when whitespace/case differ from the original', async () => {
    // Both service.ts (`c.rule.trim().toLowerCase()`) and repository.ts's
    // listRejectedRuleTexts normalize the same way before comparing — a test
    // that only ever resubmits byte-identical rule text can't tell that
    // normalization from plain string equality; a regression that drops
    // .toLowerCase() on one side but not the other would pass it silently.
    const { repoId } = await makeRepoWithSamples();

    const firstApp = await makeApp([VALID_CANDIDATE]);
    const first = await firstApp.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/extract`,
    });
    const candidateId = first.json()[0].id;
    await firstApp.inject({
      method: 'PATCH',
      url: `/conventions/${candidateId}`,
      payload: { rejected: true },
    });
    await firstApp.close();

    const variantCandidate = {
      ...VALID_CANDIDATE,
      rule: `  ${VALID_CANDIDATE.rule.toUpperCase()}  `,
    };
    const secondApp = await makeApp([variantCandidate]);
    const second = await secondApp.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/extract`,
    });
    expect(second.statusCode).toBe(201);
    expect(second.json()).toHaveLength(0);

    const list = await secondApp.inject({ method: 'GET', url: `/repos/${repoId}/conventions` });
    expect(list.json()).toHaveLength(1); // still just the one rejected row, no duplicate
    await secondApp.close();
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
