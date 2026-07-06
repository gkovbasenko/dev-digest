# dev-digest — engineering insights

Durable, evidence-backed findings. Loaded via `@import` from `CLAUDE.md`.
Newest first. See `.claude/skills/engineering-insights/SKILL.md` for what belongs here.

---

## 2026-07-06 — The feature-model registry (`FEATURE_MODELS`) has THREE copies that must stay in sync

Changing a `FeatureModelId` entry (e.g. its `defaultProvider`/`defaultModel`) requires editing three files, not two: `server/src/vendor/shared/contracts/platform.ts` (source of truth), its byte-for-byte vendored mirror `client/src/vendor/shared/contracts/platform.ts`, AND the separate hand-maintained UI copy `client/src/lib/feature-models.ts`. `tsc` does NOT catch a value drift between them — only a shape change. During the Intent Layer work the `review_intent` default was updated in the server contract and the `lib/` copy but the client *vendored* mirror was missed, leaving the two client copies disagreeing silently.

**How to apply:** after editing `FEATURE_MODELS` anywhere, `diff server/src/vendor/shared/contracts/platform.ts client/src/vendor/shared/contracts/platform.ts` (must be identical) and grep the same entry in `client/src/lib/feature-models.ts`.

**Evidence:** this session (2026-07-06); `diff` of the two `platform.ts` files showed only the `review_intent` `defaultProvider`/`defaultModel` lines diverging after the first pass.

## 2026-06-29 — `client/src/vendor/shared/` is a manual mirror of `server/src/vendor/shared/`

There is no build step that syncs shared Zod contracts from server to client. Any change to `server/src/vendor/shared/contracts/*.ts` must be manually mirrored to the identical path under `client/src/vendor/shared/contracts/`. Missing this causes client `tsc` to silently accept stale types. The two files must be kept byte-for-byte identical for the contracts they share.

**Evidence:** `client/src/vendor/shared/contracts/platform.ts` vs `server/src/vendor/shared/contracts/platform.ts`, PR #2
