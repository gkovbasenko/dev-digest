import type { WorkflowCase } from "../src/index.js";

/**
 * Systemic ("workflow") tier — asserts the real on-disk harness (CLAUDE.md + skills + subagents,
 * loaded via settingSources:["project"]) behaves as documented. Organized by scenario, not by a
 * single artifact, because these behaviors are cross-cutting.
 *
 * Budget: 5 Claude sessions total.
 *   - 3 × trace     → 1 session each                      = 3
 *   - 1 × insights pair (positive + near-miss negative)   = 2
 *
 * `trace` folds several assertions into ONE session (cheaper, coarser) and stops early once its
 * evidence is in — so a dispatch-bearing trace never waits out the nested subagent's full run.
 */
export const cases: WorkflowCase[] = [
  // --- trace (1 session): subagent dispatch ----------------------------------------------------
  {
    kind: "trace",
    // Endpoint must NOT already exist, or the model reviews the existing code inline instead of
    // planning-then-dispatching. GET /reviews/:id/export is genuinely absent from routes.ts.
    // No file-read assertion: the repo has no routed "API conventions" doc, so the model reaches
    // the real contract (contracts/review-api.ts) by exploration — an unstable anchor. The load-
    // bearing signal here is the dispatch, so assert only that.
    name: "API-route task pulls the architecture-reviewer",
    prompt:
      "Я планую додати НОВИЙ, ще не реалізований ендпоінт GET /reviews/:id/export (віддає ревʼю як " +
      "markdown). Спершу звірся з конвенціями API цього репо. Потім ОБОВʼЯЗКОВО запусти сабагента " +
      "architecture-reviewer, щоб він оцінив мій план на відповідність onion-шарам — не рецензуй сам.",
    expectSubagents: ["architecture-reviewer"],
    maxTurns: 8,
  },

  // --- trace (1 session): CLAUDE.md "Docs (read on demand)" routing ----------------------------
  {
    kind: "trace",
    // Tests the CLAUDE.md doc-routing, so the prompt must push toward CONSULTING the docs, not
    // exploring source. Earlier phrasing ("розберись, як усе влаштовано") sent the model straight
    // into schema.ts / pipeline.run.ts and it never opened the routed doc. The repo routes pipeline
    // work to docs/agent-prompts/README.md ("prompt assembly rules, grounding gate") — that is the
    // real anchor CLAUDE.md points at, not a (nonexistent) reviewer-core/docs/pipeline.md.
    name: "pipeline task follows CLAUDE.md routing to agent-prompts",
    prompt:
      "Я збираюся змінити review pipeline. Перш ніж торкатися коду — звірся з настановами цього репо " +
      "(CLAUDE.md) щодо того, яку документацію треба прочитати для змін у pipeline, і прочитай саме ці документи.",
    expectFilesRead: ["docs/agent-prompts/README.md"],
    maxTurns: 8,
  },

  // --- trace (1 session): CLAUDE.md nested-module routing for a gotchas lookup -----------------
  // Was a contrast case, but the control run (empty tmpdir) could still reach the real repo by
  // absolute path, making the negative flaky. The routing target is reviewer-core/CLAUDE.md, NOT
  // reviewer-core/INSIGHTS.md: that CLAUDE.md carries an inline "## Gotchas" section (npm-not-pnpm,
  // the grounding gate) that already answers "where might this be documented", AND it @import's
  // INSIGHTS.md — so the model finds the answer in CLAUDE.md itself and never separately Reads
  // INSIGHTS.md. Asserting the INSIGHTS Read was a wrong anchor (see INSIGHTS.md 2026-07-10: an
  // expectFilesRead path must be a file the routing REALLY lands on). The real signal is that the
  // model follows the root CLAUDE.md's "each module has its own CLAUDE.md" rule into reviewer-core.
  {
    kind: "trace",
    name: "CLAUDE.md routes a gotchas lookup to reviewer-core/CLAUDE.md",
    prompt:
      "У reviewer-core я стикнувся з несподіваною поведінкою — щось працює не так, як я очікував. " +
      "За настановами цього репо, де це вже могло бути задокументовано? Прочитай той файл.",
    expectFilesRead: ["reviewer-core/CLAUDE.md"],
    maxTurns: 5,
  },

  // --- insights pair (2 sessions): positive + near-miss negative --------------------------------
  // engineering-insights is ALWAYS-loaded (@import'd by root CLAUDE.md), so it is never Skill-
  // invoked nor is its SKILL.md Read — `activated()` is blind to it. The observable A/B is instead
  // whether the model engages the insights workflow by appending the finding to an INSIGHTS.md.
  // Recording is a Write/Edit (which `filesRead` can't see), but appending to the pre-existing
  // server/INSIGHTS.md goes via Edit, and Edit REQUIRES a prior Read of the file — so the Read of
  // INSIGHTS.md is the reliable proxy for "recorded". The prompt must carry concrete file:line
  // evidence and an explicit "record it now" instruction: given only a vague discovery the model
  // correctly stops to ask for specifics (the skill demands evidence) and never touches the file
  // within budget. maxTurns=6 leaves room to route (root CLAUDE.md → server/INSIGHTS.md) + Read + Edit.
  {
    kind: "trace",
    name: "engineering-insights activates on a genuine discovery",
    prompt:
      "Щойно з'ясував, чому similarity-запит по pgvector повертав нуль рядків: у " +
      "server/src/db/schema/knowledge.ts колонка vector('embedding', { dimensions: 1536 }) " +
      "лишилася 1536-вимірною після того, як я перемкнув модель ембедингів на 3072-вимірну, тож " +
      "жоден рядок не збігався. Зафіксуй це як інсайт у відповідному INSIGHTS.md прямо зараз.",
    expectFilesRead: ["INSIGHTS.md"],
    maxTurns: 6,
  },
  {
    kind: "trace",
    // A forbid/absence case runs the FULL budget (no early stop), so maxTurns must be generous
    // enough for the model to explore the schema AND finish its explanation and return a success
    // result — too tight (was 4) and the model gets guillotined by the turn limit mid-answer,
    // which surfaces as isError (max-turns is a non-success subtype), not as a forbid violation.
    name: "near-miss negative — explaining the same topic must NOT record an insight",
    prompt:
      "Поясни, як у pgvector працюють розмірності колонок і чому невідповідність повертає нуль рядків.",
    forbidFilesRead: ["INSIGHTS.md"],
    maxTurns: 6,
  },
];
