# reviewer-core — engineering insights

Durable, evidence-backed findings. Loaded via `@import` from `CLAUDE.md`.
Newest first. See `.claude/skills/engineering-insights/SKILL.md` for what belongs here.

---

## 2026-07-06 — `PromptAssembly.intent` was deliberately NOT added when wiring `## Intent` into `assemblePrompt`

`PromptAssembly` (the run-trace record type) is defined in `server/src/vendor/shared/contracts/trace.ts`, not in `reviewer-core`. `assemblePrompt`'s `assembly` return value is an object literal typed as `PromptAssembly`, so TS excess-property checking would reject adding an `intent` field to it without first extending that Zod contract (and mirroring the edit into `client/src/vendor/shared`). The Intent Layer plan (`docs/plans/intent-layer.md`, Lane B) scoped this task to `reviewer-core/` + docs only, so `parts.intent` is rendered into `assembly.user` (the joined string) like every other section, but there is no separate `assembly.intent` slot for per-section trace UI attribution the way `assembly.pr_description`/`assembly.repo_map`/`assembly.callers` get one.

**How to apply:** if a future task wants the run-trace UI to show intent as its own attributed block (not just buried in the raw `user` text), add `intent: z.string().nullish()` to `PromptAssembly` in `server/src/vendor/shared/contracts/trace.ts`, mirror byte-for-byte into `client/src/vendor/shared/contracts/trace.ts`, then add `intent: parts.intent ?? null` to the `assembly` object literal in `reviewer-core/src/prompt.ts`. That is 3-file, cross-module work — don't attempt it from inside a reviewer-core-only task.

**Evidence:** `reviewer-core/src/prompt.ts` (`assembly` object literal, no `intent` key), `server/src/vendor/shared/contracts/trace.ts:39-53` (`PromptAssembly` schema, no `intent` field), `docs/plans/intent-layer.md` Lane B task B1 (scoped to `reviewer-core/` only).
