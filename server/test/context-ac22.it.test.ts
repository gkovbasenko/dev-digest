import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { startPg, dockerAvailable, type PgFixture } from "./helpers/pg.js";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/platform/config.js";
import { seed } from "../src/db/seed.js";
import * as t from "../src/db/schema.js";
import { MockLLMProvider, MockEmbedder, MockGitClient } from "../src/adapters/mocks.js";
import { waitForPrRuns } from "./helpers/runs.js";
import type { Review } from "@devdigest/shared";

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn("[context-ac22] Docker not available — skipping integration tests.");
}

// The new-side line the `import { db } from '../db';` line lands on (line 2 of
// the resulting file: line 1 is the unchanged `export function handler() {}`,
// line 3 is the unchanged `export default handler;`) — the finding below
// cites this exact line so the citation-grounding gate (must intersect a real
// diff hunk) keeps it.
const DIFF = `diff --git a/api/handler.ts b/api/handler.ts
--- a/api/handler.ts
+++ b/api/handler.ts
@@ -1,2 +1,3 @@
 export function handler() {}
+import { db } from '../db';
 export default handler;`;

const INVARIANT_DOC = [
  "# Architecture invariants",
  "",
  "Module `api/` must not import `db/` directly — go through the service layer.",
  "",
].join("\n");

const REVIEW_FIXTURE: Review = {
  verdict: "request_changes",
  summary: "Introduces a direct api/ -> db/ import, violating the layering invariant.",
  score: 35,
  findings: [
    {
      id: "f1",
      severity: "CRITICAL",
      category: "bug",
      title: "api/ imports db/ directly",
      file: "api/handler.ts",
      start_line: 2,
      end_line: 2,
      rationale:
        "Per specs/invariants.md: module `api/` must not import `db/` directly. This new import bypasses the service layer boundary.",
      confidence: 0.92,
    },
  ],
};

/**
 * T13 / AC-22 — full-stack acceptance: an attached invariant doc causes a
 * grounded finding citing the doc, on a run that behaves like any other run
 * (the grounding gate still applies — the finding must intersect a real diff
 * hunk, per reviewer-core's citation-grounding boundary).
 */
d("AC-22 — attached Project Context doc grounds a citing finding", () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it("attaching specs/invariants.md to an agent produces a finding whose rationale cites it, grounded against the real diff hunk", async () => {
    const config = loadConfig({ ...process.env, NODE_ENV: "test" } as NodeJS.ProcessEnv);
    const app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: new MockLLMProvider("openai", { structured: REVIEW_FIXTURE }) },
      },
    });

    const clonePath = await mkdtemp(join(tmpdir(), "dd-ac22-"));
    const specDir = join(clonePath, "specs");
    await mkdir(specDir, { recursive: true });
    await writeFile(join(specDir, "invariants.md"), INVARIANT_DOC, "utf8");

    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: "acme",
        name: `ac22-${Date.now()}`,
        fullName: `acme/ac22-${Date.now()}`,
        defaultBranch: "main",
        clonePath,
      })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 900,
        title: "Add a direct db import in api/",
        author: "marisa.koch",
        branch: "feat/db-shortcut",
        base: "main",
        headSha: "deadbeef",
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: "needs_review",
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values({
      prId: pr!.id,
      path: "api/handler.ts",
      additions: 1,
      deletions: 0,
      patch: "@@ -1,2 +1,3 @@\n export function handler() {}\n+import { db } from '../db';\n export default handler;",
    });

    const agent = (
      await app.inject({
        method: "POST",
        url: "/agents",
        payload: {
          name: "Architecture Invariant Reviewer",
          provider: "openai",
          model: "gpt-4.1",
          system_prompt: "Enforce this repo's architecture invariants.",
        },
      })
    ).json();

    await pg.handle.db
      .insert(t.agentContextDocs)
      .values({ agentId: agent.id, path: "specs/invariants.md", order: 0 });

    const res = await app.inject({
      method: "POST",
      url: `/pulls/${pr!.id}/review`,
      payload: { agentId: agent.id },
    });
    expect(res.statusCode).toBe(200);
    const runId = res.json().runs[0].run_id;

    await waitForPrRuns(pg.handle.db, pr!.id, { expected: 1 });

    // The review + finding persisted, grounded (not dropped) — its rationale
    // cites the attached doc.
    const reviews = await pg.handle.db.select().from(t.reviews).where(eq(t.reviews.prId, pr!.id));
    expect(reviews).toHaveLength(1);

    const findings = await pg.handle.db
      .select()
      .from(t.findings)
      .where(eq(t.findings.reviewId, reviews[0]!.id));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.rationale).toContain("specs/invariants.md");
    expect(findings[0]!.file).toBe("api/handler.ts");

    // The trace confirms the doc was actually read + injected (not just a
    // coincidental string match in the fixture) and the run made no extra
    // provider calls versus any other run (AC-15).
    const trace = (await app.inject({ method: "GET", url: `/runs/${runId}/trace` })).json();
    expect(trace.specs_read).toEqual(["specs/invariants.md"]);
    expect(trace.prompt_assembly.specs).toContain('<untrusted source="specs/invariants.md">');
    expect(trace.prompt_assembly.specs).toContain("must not import `db/` directly");

    await app.close();
  });
});
