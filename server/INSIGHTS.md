# server — engineering insights

Durable, evidence-backed findings. Loaded via `@import` from `CLAUDE.md`.
Newest first. See `.claude/skills/engineering-insights/SKILL.md` for what belongs here.

---

## 2026-07-02 — Any LLM-cited file path used in a filesystem read needs an explicit clone-directory containment check, not just `path.join`

`node:path`'s `join()` does NOT sandbox — `join(clonePath, '../../etc/passwd')` happily resolves outside `clonePath`. The conventions-extraction service reads a file at `evidence_path`, a string that comes straight from the LLM's structured output (untrusted: a malicious repo could prompt-inject a traversal path into what the model cites as evidence). Confirmed exploitable with a negative-control test — reverting the fix let a real file planted one directory above the clone get read and its path persisted to the DB via a normal `extract()` call, no auth bypass or malformed request needed.

Fixed with `resolveClonePath(clonePath, file)` in `conventions/helpers.ts`: `path.resolve()` both sides, then require the resolved path to equal the root or start with `root + path.sep` (the trailing separator matters — without it, a sibling dir like `acme-repo-evil` would pass a naive `.startsWith(root)` check since it shares `acme-repo` as a string prefix).

**How to apply:** any future feature where an LLM's structured output names a path that gets read off a local clone (repo-intel, onboarding, future extraction-style features) must run it through this same containment check before the `readFile` — never trust `join()` alone with model-controlled path segments.

**Evidence:** `server/src/modules/conventions/helpers.ts` (`resolveClonePath`), `server/src/modules/conventions/service.ts` (`readCloneFile`), `server/test/conventions-helpers.test.ts` (`resolveClonePath` describe block — includes the sibling-dir-prefix case), `server/test/conventions-extract.it.test.ts` ("drops a candidate whose evidence_path attempts to traverse outside the clone directory" — plants a real file outside the clone and asserts it's never reached).

## 2026-07-02 — `pnpm db:generate` blocks on an interactive rename-vs-create prompt when a schema diff both adds and drops similarly-named columns in one run

`drizzle-kit generate` is interactive (`@clack/prompts`) whenever its diff is ambiguous — e.g. dropping `conventions.accepted` (boolean) while adding `conventions.category`/`accepted_at` in the same schema edit made it ask "Is `category` created or renamed from `accepted`?" with an arrow-key select menu. This hangs non-interactive shells (CI, this sandbox, piped `echo`/`printf` input — `@clack/prompts` needs a real TTY, not just stdin bytes) with no way to answer it non-interactively.

**How to apply:** split the schema edit into two purely-additive `pnpm db:generate` runs instead of one mixed add+drop edit: (1) add all new columns while temporarily keeping the old one, generate — a pure `ADD COLUMN` diff has no ambiguity and never prompts; (2) remove the old column from the schema, generate again — a pure `DROP COLUMN` diff is equally unambiguous. Two small generated migrations beat fighting the prompt.

**Evidence:** `server/src/db/migrations/0010_wandering_may_parker.sql` (additive: `category`/`evidence_line`/`accepted_at`/`rejected_at`/`created_at`), `0011_fuzzy_malice.sql` (`DROP COLUMN accepted`) — the single-pass attempt reproduced with `pnpm db:generate` prompting `Is category column in conventions table created or renamed from another column?`.

## 2026-07-02 — There is no multi-user auth yet; "missing workspace membership check" findings on repository methods are false positives

`getContext()` (`modules/_shared/context.ts`) resolves `{ workspaceId, userId }` via `container.auth`, and the only `AuthProvider` today is `LocalNoAuthProvider` (`adapters/auth/local.ts`) — explicit MVP no-login mode. Its `currentWorkspace()`/`currentUser()` either return the single seeded workspace/user (real DB-backed UUIDs) or **throw** (`if (!w) throw new Error(...)`); they never return `undefined`/`null`/empty-string, and `Promise<AuthWorkspace>` types `id: string` as non-optional. Every route in every module derives `workspaceId` exclusively from `getContext()` — never from a URL param, header, or body — so there is no user-controlled input path to a wrong or missing `workspaceId` either.

Given this, a review finding of the form "repository method X trusts the caller's `workspaceId` with no membership check, so a future JWT/multi-tenant bypass could leak data across workspaces" is *architecturally* describing the right future concern (when real multi-user auth ships, `getContext()` is the one place that needs a membership check) but is **not a bug in the current code** — there's no JWT, no `workspace_members` table, and no reachable path where `workspaceId` is attacker-controlled or falls through to an unscoped query today. This has been raised and rejected twice across review rounds on the skills module (once framed as "IDOR via JWT," once as "no built-in guarantee workspaceId links to the authenticated user").

**How to apply:** before accepting this class of finding, check `adapters/auth/local.ts` and confirm it's still the only registered `AuthProvider`, and check the route file to confirm `workspaceId` still comes only from `getContext()`. If both hold, the finding is speculative (correct advice for a future auth model, not a present defect) — note it for when real auth ships, don't "fix" the repository layer for it now.

**Evidence:** `server/src/adapters/auth/local.ts` (`LocalNoAuthProvider`), `server/src/modules/_shared/context.ts` (`getContext`), `server/src/modules/skills/routes.ts` (every route calls `getContext` before any repository access, no route accepts `workspaceId` as input).

---

## 2026-07-01 — `assemblePrompt`'s `skills` param is NOT delimiter-wrapped like every other untrusted input — wire this up carefully

`reviewer-core/src/prompt.ts`'s `assemblePrompt` wraps every other untrusted content type (diff, PR description, repo map, callers, specs) via `wrapUntrusted()`, so the `INJECTION_GUARD` system rule (which only recognizes `<untrusted>…</untrusted>` tags) covers them. `parts.skills` is the one exception — its bodies are joined and inserted under `## Skills / rules` completely unwrapped, because the type comment calls them "trusted-ish." Separately, `server/src/modules/skills/service.ts` wraps imported (URL or pasted-markdown) skill bodies in `<!-- BEGIN/END UNTRUSTED SKILL -->` HTML comments — a *different* delimiter scheme that `INJECTION_GUARD` doesn't know about at all, and skills stay `enabled: false` until a human vets them.

No code currently reads `AgentSkillLink`/skill bodies into a review run — `run-executor.ts`'s call to `reviewPullRequest()` never passes a `skills` array (confirmed: `skillLinks()` is only read by the agent-editor CRUD routes). So there is no live bug today. But whoever wires skills into actual agent runs must NOT simply pass `enabled` skill bodies straight into `parts.skills`: (1) only pass `enabled: true` skills — the `enabled` flag is the vetting gate; (2) either strip `UNTRUSTED_SKILL_START`/`END` before passing (if vetting = trust), or route the skill through `wrapUntrusted()` like every other untrusted input instead of the HTML-comment markers (if imported skills should stay untrusted even once enabled) — don't ship the HTML-comment-wrapped body straight into a prompt section the injection guard doesn't cover. A prominent warning to this effect is now inline at the source: `UNTRUSTED_SKILL_START`/`END` in `constants.ts` and `wrapUntrusted()` in `service.ts` — read those before touching either.

**Evidence:** `reviewer-core/src/prompt.ts:42-43` (`skills?: string[]` comment + unwrapped `skillsBlock`), `server/src/modules/skills/service.ts` (`wrapUntrusted`, `UNTRUSTED_SKILL_START/END`), `server/src/modules/reviews/run-executor.ts:191-210` (no `skills` passed to `reviewPullRequest`), flagged in post-PR review at 90% confidence (finding assumed the wiring already existed; verified it doesn't).

---

## 2026-07-01 — Drizzle read-then-write `update()` needs `SELECT ... FOR UPDATE` in a transaction, not a bare read + write

`SkillsRepository.update()` read `existing.version` via a plain `SELECT`, computed `nextVersion = existing.version + 1` in application code, then issued an `UPDATE` with no `WHERE version = existing.version` guard. Two concurrent `PUT /skills/:id` calls on the same skill both read the same starting version, both compute the same `nextVersion`, and the second `skillVersions` snapshot insert silently no-ops on the `(skillId, version)` primary-key conflict (`onConflictDoNothing()`) — one editor's body vanishes from version history with no error. Fixed by wrapping the read+write in `this.db.transaction()` with `.select().for('update')`: Postgres row-locks the skill row for the transaction's duration, so a second concurrent transaction blocks until the first commits, then reads the already-incremented version — guaranteeing distinct version numbers and no dropped snapshot. Verified against a live Postgres instance (not just mocked): two concurrent `update()` calls produced versions 2 and 3 with both bodies present in `skill_versions`, not both landing on 2.

**How to apply:** any repository method that reads a row, derives a value from it (a counter, a version, an aggregate), and writes it back must either use `SELECT ... FOR UPDATE` inside a transaction or push the increment into the `UPDATE` statement itself (`SET version = version + 1`) — never read-compute-write as three separate unguarded statements.

Added a second line of defense on top of the lock: the `UPDATE`'s `WHERE` clause also checks `eq(version, existing.version)` (an optimistic-lock guard). Under correct code this can never fail to match — the row lock already guarantees nothing else could have changed the version since `existing` was read in this same transaction — so it's a no-op today, verified against a live Postgres for both the sequential and concurrent paths. Its only job is turning a *future* regression (someone calling `update()` outside a transaction, or the lock otherwise getting bypassed) into a loud, detectable zero-row `UPDATE` (logged via `console.error`) instead of a silently-dropped snapshot.

**Evidence:** `server/src/modules/skills/repository.ts` (`update()`), `server/test/skills-concurrency.it.test.ts`; testcontainers couldn't attach to this sandbox's Colima docker socket (log-wait-strategy timeout), so the fix was verified with a scratch script against the docker-compose Postgres instance directly before being committed as the `.it.test.ts`.

---

## 2026-07-01 — `POST /skills/import` URL fetch requires SSRF protection; raw `fetch()` is unsafe

Any server-side URL fetch driven by user input is an SSRF vector. `POST /skills/import` previously called `fetch(input.url)` with no validation beyond Zod's `z.string().url()` (syntax only). A workspace member could target `http://169.254.169.254/` (AWS metadata), `http://localhost:5432` (postgres), or any internal host. The fix now lives in `server/src/modules/skills/fetch-skill.ts` (`fetchSkillUrl()`, moved out of `service.ts`) and must be used for ALL future server-side URL fetches from user input:
1. Reject non-HTTPS protocols before DNS resolution.
2. Resolve hostname via `dns.lookup()` and block private/reserved ranges before connecting — including IPv4-mapped IPv6 forms (`::ffff:10.0.0.1`), which `isBlockedIPv6` must unwrap and re-check against `isBlockedIPv4` rather than pattern-matching the IPv6 string directly.
   **Gotcha:** don't block CIDR ranges with a plain string-prefix check unless the prefix length is a multiple of 4 bits (a hex-digit boundary). `fe80::/10` (link-local) is a 10-bit prefix, so it spans first-hextet values `fe80`-`febf` — `norm.startsWith('fe80')` only matches the literal string `fe80` and misses `fe81`-`febf` (e.g. `fe90::1`, `febf::1`), letting an attacker-controlled DNS answer bypass the block. `fc00::/7` (unique-local) happens to be safe as `startsWith('fc') || startsWith('fd')` since 7 bits split evenly across two hex-digit values — that's a coincidence of the specific prefix length, not a pattern to rely on. When the prefix doesn't land on a 4-bit boundary, parse the hextet as a number and mask it (`(firstHextet & 0xffc0) === 0xfe80`), don't string-match.
   **Gotcha 2:** `isBlockedIPv6` now fully expands the address (via `expandIPv6()`) to 8 zero-padded hex groups before any check, so `::1`, `0:0:0:0:0:0:0:1`, and `0000:...:0001` are all recognized as loopback regardless of which of IPv6's many equivalent textual forms was given — same for `::` vs `0:0:0:0:0:0:0:0` (unspecified, previously unblocked entirely). A review flagged this as an *actively exploitable* SSRF bypass ("attacker chooses the expanded DNS response form") — that premise doesn't hold: AAAA records store a raw 128-bit value, and `dns.lookup()`'s text form comes from the resolver's own RFC 5952 canonicalization (always compressed), not from anything the authoritative server transmits — verified empirically (`dns.lookup('localhost', {family:6})` → always `"::1"`, never the expanded form, regardless of how a test nameserver might author its zone file). So this wasn't reachable via the actual `fetchSkillUrl` call path. Implemented anyway since `isBlockedIPv6` is exported and correctness shouldn't depend on which of several equivalent spellings happens to reach it — but don't accept a "DNS returns attacker-chosen text" threat model at face value without checking how the resolver you're using actually behaves.
3. Pass `redirect: 'error'` to `fetch()` — the target host is only validated once, before the request; a 3xx to an internal host would otherwise be followed silently.
4. Pin the actual connection to the validated address via a per-request `undici.Agent({ connect: { lookup } })` dispatcher whose `lookup` ignores the hostname it's given and always returns the address resolved in step 2. Without this, `fetch()` re-resolves the hostname itself at connect time, and an attacker-controlled DNS server can answer safely for the check but privately (e.g. `127.0.0.1`) for the real connection — classic DNS rebinding. `undici` is pinned to the `6.x` line in `server/package.json` to match the `undici-types` version bundled with `@types/node`; installing a newer `undici` major (e.g. 8.x) causes its `Dispatcher` type to structurally diverge from `RequestInit['dispatcher']` and fails `tsc`.
   **Gotcha:** the custom `lookup` must handle BOTH callback shapes Node's connector uses — `(err, address, family)` for a single result and `(err, [{address, family}, ...])` when called with `options.all` (used by Node's dual-stack/Happy-Eyeballs connect path, which real HTTPS connections hit routinely). Handling only the single-address form doesn't fail loudly in mocked tests (they stub `fetch` entirely) — it throws `TypeError: fetch failed` / `cause: ERR_INVALID_IP_ADDRESS` against a REAL socket connect, i.e. every real import would 500. Caught only by hitting an actual URL end-to-end (`server/test/skills-import.it.test.ts`), not by the unit tests.
5. When mapping a `fetch()` rejection to a friendlier message, check `err.cause.message`, not `err.message` or `err instanceof TypeError` alone — undici's actual shape for `redirect: 'error'` is `TypeError: fetch failed` with the real reason (`Error: unexpected redirect`) on `.cause`. Catching bare `TypeError` mislabels ANY fetch failure (network errors, the `options.all` bug above, TLS errors) as "redirects are not allowed," hiding the real cause. Verified by reproducing a real 302 against a local `http.createServer` — don't guess undici's error shape, reproduce it.
6. Enforce a short `AbortSignal.timeout()`.
7. Cap response body size to prevent memory exhaustion — and don't fire-and-forget `reader.cancel()` when the cap is hit; it returns a Promise that can reject (stream already errored), and an unawaited rejection there is an unhandled rejection that can crash the process. Use `reader.cancel().catch(() => {})`.
8. `close()` the per-request `Agent` dispatcher in a `finally` block once the fetch is done. It's scoped to one already-validated address, so nothing else can reuse its connection pool — leaving it open just holds a keep-alive socket until undici's own idle timeout for no benefit. (Note: constructing `new Agent(...)` itself is cheap/synchronous — no DNS or socket I/O happens at construction time, only on first dispatch — so per-call construction is not the resource concern; not closing it after use is.) `.close()` itself can reject — swallow it (`.close().catch(() => {})`), otherwise a cleanup failure in the `finally` block replaces whatever the `try` block was already returning/throwing, masking the real outcome.
9. Throw the project's `ValidationError`/`ExternalServiceError` (from `platform/errors.ts`), never a bare `Error`. The global error handler (`app.ts`'s `setErrorHandler`) only maps status codes for `instanceof AppError` — a plain `Error` always falls through to 500 `internal_error`, regardless of how validation-ish the message reads. All the "your URL/its content is wrong" throws (bad protocol, SSRF-blocked, redirect, non-2xx, empty body, size cap) are `ValidationError` (422); a genuine unreachable-target failure (connection refused, TLS failure, our own timeout) is `ExternalServiceError` (502, with the original error passed as `details` so its cause chain isn't lost). Verified end-to-end: `POST /skills/import` with an `http://` URL now returns `422 validation_error` instead of `500 internal_error`.
10. `fetch()` the *parsed* URL (`parsed.href`), not the raw input string. `new URL(rawUrl)` is what the protocol/SSRF checks above actually validated — passing the original `rawUrl` string to `fetch()` means its internal URL parsing has to independently agree with `new URL()`'s parse for the validation to actually hold. Node's fetch (undici) uses the same WHATWG URL parser, so this wasn't exploitable in practice, but there's no reason to rely on two separate parses staying in sync when passing the already-parsed value costs nothing.

**How to apply:** any future endpoint that fetches a user-supplied URL must go through `fetchSkillUrl()` or an equivalent — never raw `fetch(userInput)`. When testing SSRF protections, don't just stub global `fetch` — that bypasses the dispatcher entirely and won't catch a regression in the pinning logic; assert on the `lookup` function passed to `Agent` directly (see the "pins the connection" / "all records" tests). For anything touching an actual outbound connection, run it end-to-end at least once (real DNS + real socket) before trusting mocked-fetch unit tests — two real bugs here (the `options.all` shape and the redirect-error mislabeling) only surfaced when exercised through the real `POST /skills/import` route against a live Postgres + real network call.

**Evidence:** `server/src/modules/skills/fetch-skill.ts` (`fetchSkillUrl`, `isBlockedIPv6`), `server/test/skills-fetch.test.ts` ("pins the connection", "all records callback form", "does not mask an unrelated fetch failure" tests), `server/test/skills-import.it.test.ts`; originally landed PR #6 commit `b5c99de`, IPv4-mapped/redirect/rebinding gaps flagged in follow-up review at 75-90% confidence; the `options.all` and error-mislabeling bugs were introduced by that same fix and only found by running a real import against `raw.githubusercontent.com`.

---

## 2026-07-01 — Fastify literal route segments must be registered before parameterized ones

Fastify matches routes in registration order. If `GET /skills/:id` is registered before `GET /skills/community`, Fastify attempts to parse `"community"` as a UUID for the `:id` param and returns 422 before the literal route is ever reached. The symptom is a 422 with a Zod/UUID validation error on a request to a path that looks like a static segment.

**How to apply:** in any module where a literal path segment could be mistaken for a param (e.g. `/skills/import`, `/skills/community`), register those literal routes **first**, before any `/:id` route. See `server/src/modules/skills/routes.ts` (comment at top of file explains the ordering constraint).

**Evidence:** `server/src/modules/skills/routes.ts` (registration order: `/skills/import` → `/skills/community` → `/skills/:id`), discovered while designing the skills module in PR #6.

---

## 2026-06-30 — PostgreSQL window functions scan all qualifying rows regardless of outer WHERE

A `ROW_NUMBER() OVER (PARTITION BY ...)` CTE must evaluate every row that matches the base `WHERE` clause before the outer `WHERE rn <= N` filter is applied. This means selecting a large column (e.g. `rationale TEXT`) inside the CTE causes the DB to read it for *all* matching rows — not just the N that survive the outer filter. For a PR list with 50 PRs × 100 findings each, selecting `rationale` inside the CTE transfers ~500KB of text only to discard 95% of it.

**How to apply:** when using `ROW_NUMBER()` to pick top-N per partition, exclude heavy columns from the CTE. After filtering, do a second batched query (`WHERE id IN (...)`) to fetch those columns for only the winners. See `server/src/modules/pulls/routes.ts` (top_findings two-phase query: CTE selects metadata only; post-filter IN-query fetches rationale).

**Evidence:** `server/src/modules/pulls/routes.ts` (commits `c5bc7f5` two-phase split, `9175072` original CTE), flagged in PR #3 review at 70% confidence.

---

## 2026-06-30 — A PR can have multiple `reviews` rows; latest-only aggregation hides findings

Each agent run creates its own row in `reviews` (with its own findings via the `review_id` FK). Old reviews are **not** deleted when an agent re-runs or when a different agent runs. The PR detail page reflects this by rendering every review as a separate `ReviewRunAccordion`. So any per-PR aggregation that picks only the latest review (e.g., `ORDER BY created_at DESC LIMIT 1`) will silently mask findings from prior reviews — for example, if the newest review is an "approve / no findings" run.

**How to apply:** for any PR-level rollup of findings (counters, badges, gates), JOIN `findings → reviews` and aggregate by `reviews.pr_id` across all `kind='review'` rows, filtering `findings.dismissed_at IS NULL` for "open" counts. The single-number SCORE may still use the latest review (one row, deliberate), but counts must not.

**Evidence:** `server/src/db/schema/reviews.ts` (no UNIQUE on `pr_id`; `created_at` ordering), `server/src/modules/reviews/run-executor.ts:218` (every run inserts a new review row), bug surfaced on PR #3 where the list showed a green ✓ while the detail page listed open findings.

---

## 2026-06-29 — `agent_runs` does not store `cost_usd`; derive it at read time

There is no `cost_usd` column on the `agent_runs` table (only `tokens_in`, `tokens_out`, `model`). The `ci_runs` table does have `cost_usd`, which makes the omission easy to miss. Cost must be computed on read via `estimateCost(model, tokensIn, tokensOut)` from `src/adapters/llm/pricing.ts`. If a model slug is not in the pricing table, `estimateCost` returns `null` — this is intentional and safe.

**Evidence:** `server/src/db/schema/runs.ts` (no `costUsd` column), `server/src/adapters/llm/pricing.ts:37`, PR #2

---

## 2026-06-29 — `agentRuns.prId` is typed `string | null` despite being a required FK

Drizzle infers the column as `string | null` even though `prId` is semantically required (every run belongs to a PR). Using it as a `Map<string, …>` key fails `tsc` without a null guard. Pattern: `if (!run.prId) continue` before any Map operation.

**Evidence:** `server/src/db/schema/runs.ts` (column definition), type error hit in `server/src/modules/pulls/routes.ts:146` during PR #2
