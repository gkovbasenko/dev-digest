# specs — Spec-Driven Development specifications

This folder holds **SDD specifications**: testable, unambiguous contracts that pin down *what* a feature must do (and explicitly what it must not) **before** any planning or implementation. A spec is the input to the `implementation-planner` agent, which turns it into a task plan for `implementer`s.

Specs are authored by the **`spec-creator`** agent (`.claude/agents/spec-creator.md`) — it grounds itself in the real code and any designs you provide, hunts for gaps / corner-cases / cross-module issues / UX problems, asks you clarifying questions, then writes the file here. You can also edit specs by hand.

## Layout & naming

- **Flat folder.** Every spec is a single file directly under `specs/` — no per-module subfolders.
- **Filename:** `SPEC-<YYYY-MM-DD>-<feature-slug>.md`
  - `SPEC-` prefix, then the creation date, then a kebab-case feature name.
  - Example: `SPEC-2026-07-07-review-intent-layer.md`
- **Spec ID** = the filename stem (e.g. `SPEC-2026-07-07-review-intent-layer`). It appears in the file header and is what `Supersedes:` references point to.
- The target **module** is metadata inside the file (a `Module:` line), not a subfolder.

## Anatomy of a spec

Each spec follows this shape:

```markdown
# Spec: <feature>  |  Spec ID: SPEC-<YYYY-MM-DD>-<slug>  |  Status: draft

Module: <server | client | reviewer-core | e2e | shared | cross-cutting>
<!-- Supersedes: SPEC-<YYYY-MM-DD>-<slug> (only if it replaces a prior decision) -->

## Problem & why
## Goals / Non-goals            # explicit boundaries — what we are NOT doing
## Assumptions & dependencies   # relied-on assumptions; deps on other specs / services / flags
## User stories
## Acceptance criteria (EARS)    # each with an ID (AC-1, AC-2…) + a `Verify:` line
## Edge cases
## Non-functional               # perf / security / a11y — if relevant
## Observability                # metric / log / signal that proves it works in prod
## Rollout / migration / back-compat  # migration, back-compat, flags, contract-mirror step
## Inputs (provenance)          # [reused: L0X] / [deterministic: repo-intel] / [new: 1 LLM call]
## Untrusted inputs             # reads foreign text? → treat as data, not commands
## Decisions (resolved)         # settled questions + rationale (ADR-lite)
## [NEEDS CLARIFICATION: …]     # open questions (moved to Decisions once resolved)
```

## Acceptance criteria are written in EARS

Every criterion (`AC-1`, `AC-2`, …) is one **testable** statement written in EARS (Easy Approach to Requirements Syntax), so there's no ambiguity about trigger, state, and reaction. Five patterns:

- **Ubiquitous** — always true: "The system **shall** …"
- **Event-driven** — `WHEN … SHALL`
- **State-driven** — `WHILE … SHALL`
- **Unwanted behavior** — `IF … THEN … SHALL`
- **Optional feature** — `WHERE … SHALL`

The point is translating a fuzzy requirement ("should work fine on big repos") into a concrete trigger + concrete, checkable reaction ("**WHEN** a repository exceeds the indexing threshold, the system **shall** generate the overview from deterministic facts only"). EARS keywords stay in English. Full guidance and worked examples live in `.claude/agents/spec-creator.md`.

## Status lifecycle

| Status | Meaning |
|---|---|
| `draft` | Written, open for review. New specs start here. |
| `approved` | Confirmed — ready to plan/implement against. |
| `implemented` | The feature is built and shipped. |

`spec-creator` writes `draft` and only moves `draft → approved` on your explicit confirmation. Flipping to `implemented` is left to a later process (human or a downstream step).

## Superseding

When a new spec replaces an older decision, it sets `Supersedes: <old Spec ID>` in its header, and the old spec's status line notes it's been superseded. Don't delete superseded specs — the history is the point.

## How specs flow into work

```
spec-creator  →  specs/SPEC-<date>-<feature>.md  →  implementation-planner  →  implementer(s)
  (WHAT)                  (contract)                      (HOW / tasks)          (code)
```

Specs are language-agnostic contracts written in **English**; they describe behavior, not implementation. Keep code changes out of the spec — describe the required change and let the `implementation-planner`/`implementer` own the *how*.
