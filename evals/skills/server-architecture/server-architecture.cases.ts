import type { SkillCase } from "../../src/index.js";

// This skill is a REVIEWER/PLACEMENT guide for server/ — it decides which layer code belongs in,
// catches forbidden cross-layer patterns, and (via rules/correct-patterns.md) avoids false
// positives on patterns that only LOOK wrong. "quality" cases run with NO tools (skillTask
// measures the injected artifact content in isolation — see tasks.ts), so each prompt inlines a
// small synthetic code snippet the skill can reason over directly, standing in for the file the
// skill would normally Read itself.
//
// Injection note: skillContent() (src/artifacts/load.ts) assembles SKILL.md + references/*.md +
// rules/*.md, so these cases see this skill's real substance (forbidden.md, correct-patterns.md,
// layers.md, container.md). Thresholds below are calibrated against the first passing run — retune
// if the skill's rules change materially.

const PREAMBLE = `You are reviewing a change to the dev-digest server (server/, @devdigest/api). The relevant code is inlined below — treat it as already gathered, review it directly against this project's server architecture, and do not ask for file/tool access or more context.`;

export const cases: SkillCase[] = [
  {
    name: "flags real cross-layer violations with the correct layer and a concrete fix",
    kind: "quality",
    prompt: `${PREAMBLE}

\`\`\`ts
// server/src/modules/repos/routes.ts
export default async function reposRoutes(app: FastifyInstance) {
  app.get('/repos/:id/diff', async (req) => {
    const diff = await app.container.git.diff(req.params.id, 'HEAD')
    return diff
  })
}

// server/src/modules/reviews/service.ts
export class ReviewService {
  private llm = new AnthropicLLM(process.env.ANTHROPIC_KEY!)

  async summarize(prId: string) {
    const rows = await this.container.db.execute(
      sql\`SELECT * FROM findings WHERE pr_id = \${prId}\`,
    )
    return rows
  }
}

// server/src/modules/repos/repository.ts
export class RepoRepository {
  constructor(private db: Db) {}
  async listAll() {
    return this.db.select().from(repos)
  }
}
\`\`\`

Review this against our server architecture and list what's wrong.`,
    practices: [
      "flags the route handler calling app.container.git.diff(...) directly as forbidden — a route must delegate to a service, not reach an adapter",
      "flags `new AnthropicLLM(...)` inside ReviewService as forbidden direct adapter instantiation outside platform/container.ts, and recommends resolving it via the container (e.g. container.llm('anthropic'))",
      "flags reading process.env.ANTHROPIC_KEY outside platform/config.ts as a violation of the env-access rule",
      "flags ReviewService touching the database directly (container.db / raw SQL) as a violation — DB access belongs in a repository, and raw SQL is disallowed outside migrations",
      "flags RepoRepository.listAll() for missing the workspaceId tenancy filter",
      "every issue raised points at a specific inlined construct (a named class/method/line), and the review does not invent violations that are not present in the snippet",
    ],
    threshold: 0.7,
    maxTurns: 10,
  },
  {
    name: "does NOT flag correct patterns that only look like violations (precision)",
    kind: "quality",
    prompt: `${PREAMBLE}

\`\`\`ts
// server/src/modules/agents/repository.ts
export class AgentRepository {
  constructor(private db: Db) {}
  // returns the Drizzle row type by design
  async listEnabled(workspaceId: string): Promise<AgentRow[]> {
    return this.db.query.agents.findMany({
      where: and(eq(agents.workspaceId, workspaceId), eq(agents.enabled, true)),
    })
  }
}

// server/src/modules/reviews/service.ts
export class ReviewService {
  constructor(private container: Container) {}
  private repo = new ReviewRepository(this.container.db)

  async run(workspaceId: string, prId: string): Promise<ReviewDto> {
    const github = await this.container.github()
    const enabled = await this.container.agentsRepo.listEnabled(workspaceId)
    const parsed = parseRepoUrl(prId) // pure helper in helpers.ts, contains branching
    const review = await this.repo.insert(workspaceId, parsed, enabled)
    return toReviewDto(review)
  }
}
\`\`\`

Review this against our server architecture. Is anything wrong?`,
    practices: [
      "does NOT flag `constructor(private container: Container)` as a service-locator / god-object anti-pattern — passing the whole Container into a service is this project's mandated DI shape",
      "does NOT flag the service constructing its OWN module's repository via `new ReviewRepository(this.container.db)` as a container bypass or a direct-DB violation — that is sanctioned; only adapters are container-only",
      "does NOT flag AgentRepository.listEnabled returning `AgentRow[]` (a Drizzle row type) as a DB-shape leak — repositories return row types by design; DTO conversion happens one layer up",
      "does NOT flag reading `container.agentsRepo.listEnabled(...)` as cross-module coupling — the container's shared repositories are the sanctioned cross-module channel",
      "does NOT flag `await this.container.github()` in the service as a missing dependency injection — async adapter getters are the container's documented API",
      "concludes the snippet is architecturally correct (or that these specific patterns are fine here), rather than manufacturing violations from patterns that are actually correct",
    ],
    threshold: 0.8,
    maxTurns: 10,
  },
  {
    name: "places each responsibility in the correct layer/file",
    kind: "quality",
    prompt: `${PREAMBLE}

I'm adding an "archive repo" feature to the repos module. For EACH of the following, tell me which file/layer it belongs in and why:

1. Reject the request if the repo is already archived.
2. Read the GitHub token needed to call the GitHub API.
3. Run the UPDATE that sets repos.archived = true.
4. Call the GitHub API to archive the remote repository.
5. Check whether any agent is enabled for the workspace before archiving.
6. Return the archived repo to the HTTP caller.`,
    practices: [
      "puts the 'already archived?' rejection (a business rule) in the service layer (service.ts), not in the route handler or the repository",
      "reads the GitHub token as a credential resolved through the container (from container.secrets, as the github adapter does behind container.github()), not via ad-hoc process.env access in the service or route",
      "puts the UPDATE on the repos table in the module's repository.ts, scoped by workspaceId, not inline in the service or route",
      "routes the GitHub API call through an adapter resolved via container.github() and called from the service — not directly from the route, and not by instantiating a client inline",
      "reads whether an agent is enabled through the container's shared repository (container.agentsRepo), not by importing the agents module's repository or service class directly",
      "has the service return a DTO to the caller rather than a raw Drizzle row type",
    ],
    threshold: 0.6,
    maxTurns: 10,
  },
];
