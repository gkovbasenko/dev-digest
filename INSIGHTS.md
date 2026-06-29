# dev-digest — engineering insights

Durable, evidence-backed findings. Loaded via `@import` from `CLAUDE.md`.
Newest first. See `.claude/skills/engineering-insights/SKILL.md` for what belongs here.

---

## 2026-06-29 — `client/src/vendor/shared/` is a manual mirror of `server/src/vendor/shared/`

There is no build step that syncs shared Zod contracts from server to client. Any change to `server/src/vendor/shared/contracts/*.ts` must be manually mirrored to the identical path under `client/src/vendor/shared/contracts/`. Missing this causes client `tsc` to silently accept stale types. The two files must be kept byte-for-byte identical for the contracts they share.

**Evidence:** `client/src/vendor/shared/contracts/platform.ts` vs `server/src/vendor/shared/contracts/platform.ts`, PR #2
