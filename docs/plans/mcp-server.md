# Development Plan: локальний MCP-сервер для dev-digest (stdio, 5 інструментів)

> Статус: **узгоджено, очікує на approve перед реалізацією.**
> Референс для імплементерів. Заземлено на реальні файли (cite `file:line`).

## Goal & success criteria
Новий top-level пакет `mcp/` (`@devdigest/mcp`) — локальний **stdio** MCP-сервер для
Claude Code, що є ТОНКОЮ обгорткою над Fastify API (`http://localhost:3001`).
Жодної бізнес-логіки: кожен інструмент викликає наявні HTTP-ендпоінти.

"Done":
- `npm run typecheck` і `npm test` у `mcp/` — зелено.
- Сервер стартує по stdio, реєструє рівно **5 інструментів**: `list_agents`,
  `run_review`, `get_findings`, `get_conventions`, `get_blast_radius`.
- Логи — у **stderr**; stdout лишається чистим каналом протоколу.
- Проти запущеного `@devdigest/api` із seed: `list_agents` → компактний список;
  `run_review` → create→wait→findings за 1 виклик із graceful-timeout;
  `get_findings`/`get_conventions` → компактні структури;
  `get_blast_radius` → `{ status: 'not_implemented', hint }`.
- README містить сніпет реєстрації в Claude Code.

## Узгоджені рішення (не переобговорюємо)
1. **Розташування:** новий top-level пакет `mcp/` (сусід `e2e/`), власний lockfile,
   **npm** (як `reviewer-core/` та `e2e/`). Deps: `@modelcontextprotocol/sdk`, `zod`.
   Власні `CLAUDE.md` + `tsconfig.json` у стилі `e2e/`.
2. **Ідентифікатори — людино-читані, резолвляться в uuid усередині MCP.** Інструменти
   приймають `repo` ('owner/name'), `pr` (номер, int), `agent` (ім'я, string).
3. **`run_review` — outcome-oriented:** create run → wait → findings за ОДИН виклик.
   Wait із timeout **`WAIT_TIMEOUT_MS = 120000` (120с)**. На таймауті —
   `{ runId, status: 'running', hint: 'call get_findings later with pr=...' }`
   (graceful fallback, не помилка).
4. **`get_blast_radius` — СТАБ:** `{ status: 'not_implemented', hint }`. Повну фічу (L04)
   роблять пізніше. `repoIntel.getBlastRadius` існує на фасаді, але роут НЕ під'єднаний —
   не під'єднувати; лише стаб у MCP.
5. **Неоднозначність імені агента:** `resolveAgent(name)` — рівно 1 збіг → беремо;
   >1 → фільтр по `enabled:true`, і якщо лишився рівно один → беремо; інакше (>1 або 0
   після фільтра) → actionable-помилка зі списком кандидатів (`name · provider · model ·
   enabled`) + підказка. Без disambiguator-параметра (YAGNI), без тихого авто-вибору.
6. **Транспорт — тільки stdio.** Claude Desktop пропускаємо; докидокументація — під
   Claude Code (`claude mcp add` / проєктний `.mcp.json`).

## Архітектурна межа (перевірено проти `server-architecture` skill)
MCP-пакет стоїть **поза onion-архітектурою `server/`**. Onion регулює внутрішні шари
сервера (route → service → repository → adapter; контейнер — єдиний вхід до адаптерів).
MCP — це **окремий процес і ще один HTTP-клієнт** сервера, рівно як `client/` (Next.js):
він торкається лише **HTTP-шару** (`modules/*/routes.ts`) і **ніколи** — контейнера, БД,
Drizzle-схеми, адаптерів чи будь-яких internals. Тому:
- Правила onion **не застосовуються** до внутрішнього устрою `mcp/` (це було б
  категоріальною помилкою) — MCP має власну плоску структуру (`api-client`/`resolve`/`tools`).
- Напрям залежностей коректний: `mcp → HTTP → server`. Зворотної залежності немає;
  `server/` про MCP не знає.
- **Єдиний випадок, коли onion застосовний** — якщо приймаємо опційний T6 (lookup-ендпоінт
  на сервері). Тоді код живе в `server/` і **мусить** пройти route → repository/db,
  workspace-scoped, **без** виклику GitHub-адаптера (див. T6).

## Принципи дизайну (baked in)
Токен-ощадливість на старті: рівно 5 tools, без Resources/Prompts, короткий `instructions`
(2-3 рядки), пісні плоскі схеми, без search_tools/code-execution (overkill на 5 tools).
4 принципи слайда: (1) результат-не-операція — `run_review` робить 3 кроки сам;
(2) плоскі скаляри — ніяких вкладених об'єктів; (3) стисла структурована відповідь —
`{verdict, findings[]}` без rationale-дампів; (4) помилка веде далі — кожна error-гілка
називає наступний корисний інструмент. `run_review` — non-read-only/expensive
(`readOnlyHint:false`, `openWorldHint:true`); 4 інші — `readOnlyHint:true`. Помилки —
як structured tool result, не кинуті винятки.

## Grounding: перевірені факти про API (base `http://localhost:3001`, без префікса)
Роути реєструються плоско, без префікса (`server/src/app.ts:168-169`).

- `GET /agents` → `Agent[]` — `server/src/modules/agents/routes.ts:74`, `AgentsService.list`
  (`service.ts:58`). Контракт `Agent`: `id,name,description,provider,model,system_prompt,
  output_schema,enabled,version,strategy,ci_fail_on,repo_intel`
  (`server/src/vendor/shared/contracts/knowledge.ts:189`).
- `GET /repos` → `Repo[]` — `server/src/modules/repos/routes.ts:33`. `Repo.full_name =
  "owner/name"` (`platform.ts:145`), унікальний у workspace (dedupe `repos/service.ts:94`).
  **Резолвер `owner/name → repoId`.**
- `GET /repos/:id/pulls` → `PrMeta[]` — `server/src/modules/pulls/routes.ts:28`.
  **Резолвер `pr number → prId`.** Увага: `PrMeta.id` — nullish (`platform.ts:158`).
  **Side effect:** цей роут робить живий GitHub-синк на кожен виклик (`gh.listPullRequests`
  + backfill), якщо токен налаштований; без токена — graceful fallback на persisted-дані.
  Тобто резолв номера PR може бути важким/повільним. Опційне пом'якшення — T6.
- `GET /repos` → чистий список із БД, **без** GitHub-синку (`repos/service.ts` `list`,
  `repos/routes.ts:33`). Резолв `owner/name → repoId` дешевий.
- `POST /pulls/:id/review` body `{agentId}` | `{all:true}` —
  `server/src/modules/reviews/routes.ts:30`. **Rate limit 10/хв** (`routes.ts:32`).
  **Fire-and-forget:** повертає негайно з `reviews: []`, виконання у фоні
  (`reviews/service.ts:141-145`). Форма: `{ pr_id, runs:[{run_id,agent_id,agent_name}],
  reviews:[] }`.
- `GET /pulls/:id/runs/active` → `RunSummary[]` (`routes.ts:98`);
  `GET /pulls/:id/runs` → `RunSummary[]` усі статуси (`routes.ts:104`).
  `RunSummary.status ∈ running|done|failed|cancelled` (`trace.ts:100`), містить `run_id`,
  `score`, `findings_count`, `error`.
- `GET /pulls/:id/reviews` → `ReviewDto[]` — `routes.ts:132`, `reviewsForPull`
  (`service.ts:168`). `ReviewDto`: `id,pr_id,agent_id,run_id,agent_name,kind,verdict,
  summary,score,model,findings[]` (`reviews/helpers.ts:18`). `ReviewDtoFinding`:
  `severity,category,title,file,start_line,end_line,rationale,suggestion,confidence,kind,
  review_id,accepted_at,dismissed_at` (`helpers.ts:12`, `findingRowToDto:34`).
  `Verdict ∈ request_changes|approve|comment` (`findings.ts:26`).
- `GET /repos/:id/conventions` → `ConventionCandidate[]` —
  `server/src/modules/conventions/routes.ts:61`. Контракт: `id,rule,category,evidence_path,
  evidence_snippet,confidence,accepted,rejected` (`knowledge.ts:155`).
- Tenancy: `server/src/modules/_shared/context.ts` `getContext` → workspaceId через
  `LocalNoAuthProvider` (default workspace). Заголовок авторизації в MVP не потрібен.

## Insights, що формують дизайн
- **MCP НЕ імпортує `@devdigest/shared`** — визначає власні мінімальні `*Lite`-типи.
  Причина: `client/src/vendor/shared/` — ручний byte-for-byte мірор серверних контрактів
  без білд-кроку (root `INSIGHTS.md` 2026-06-29); підтягнувши shared, наклали б те саме
  зобов'язання й зчепили б пакет із сервером. **Shared-контракти не змінюються взагалі.**
- **На PR буває кілька `reviews`-рядків; "лише останній" ховає findings**
  (`server/INSIGHTS.md` 2026-06-30; `reviews/run-executor.ts:218`). `get_findings` агрегує
  по всіх `kind:'review'` (відкриті = `dismissed_at===null`); `run_review` матчить по
  власному `run_id`.
- **POST /review — fire-and-forget** (`reviews/service.ts:145` завжди `reviews:[]`) →
  findings лише через wait-loop.
- **`agents.name` НЕ унікальне** — лише `notNull()` (`server/src/db/schema/agents.ts:13`)
  → резолвер обробляє неоднозначність (див. рішення №5).

## Структура пакета
```
mcp/
  package.json          # @devdigest/mcp, type:module, npm
  package-lock.json     # згенерований npm install
  tsconfig.json         # ES2022/ESNext/Bundler/strict/noEmit (стиль e2e)
  CLAUDE.md  README.md  .gitignore
  src/
    config.ts           # DEVDIGEST_API_URL(=http://localhost:3001), WAIT_TIMEOUT_MS(=120000), HTTP_TIMEOUT_MS(~15000)
    log.ts              # логер у stderr
    types.ts            # локальні *Lite-інтерфейси (НЕ @devdigest/shared)
    api-client.ts       # fetch+timeout, error→actionable mapping
    resolve.ts          # owner/name→repoId, pr#→prId, agent name→agentId
    tools/
      tool.ts           # ToolDef-контракт
      list-agents.ts  run-review.ts  get-findings.ts
      get-conventions.ts  get-blast-radius.ts
      wait-for-run.ts   # wait-with-timeout петля
    index.ts            # bootstrap: StdioServerTransport + реєстрація 5 tools
  test/                 # vitest
```

## `run_review` — потік
```
run_review(repo, pr, agent)
  → GET /repos                     resolve owner/name → repoId
  → GET /repos/:repoId/pulls       resolve pr#       → prId
  → GET /agents                    resolve name      → agentId (enabled-narrowing)
  → POST /pulls/:prId/review {agentId}   → { runs:[{run_id}], reviews:[] }
  → loop poll GET /pulls/:prId/runs (backoff 1s→cap 5s, до 120с), match run_id
      done      → GET /pulls/:prId/reviews → { verdict, score, findings[] } (той run_id)
      timeout   → { runId, status:'running', hint:'call get_findings later with pr=<pr>' }
      failed/cancelled → error-forward (error + hint)
```
Wait — polling (не SSE): простіше й ідемпотентніше в короткоживучому MCP-виклику;
матч по власному `run_id`, отриманому з POST.

## Задачі (парелелізовані)

### T1 — Scaffold + foundation (блокуючий)
Files: `mcp/package.json`, `tsconfig.json`, `CLAUDE.md`, `README.md` (скелет),
`.gitignore`, `src/config.ts`, `src/log.ts`, `src/types.ts`, `src/api-client.ts`,
`src/resolve.ts`, `src/tools/tool.ts`; `npm install` (генерує lockfile).
- `package.json`: `@devdigest/mcp`, `type:module`, scripts `typecheck`(`tsc --noEmit`),
  `test`(`vitest run`), `start`/`dev`(`tsx src/index.ts`). Deps: `@modelcontextprotocol/sdk`,
  `zod`. devDeps: `tsx`, `typescript`, `@types/node`, `vitest` (версії як в `e2e/`).
- `tsconfig.json`: стиль `e2e/tsconfig.json` (ES2022, ESNext, Bundler, strict, noEmit,
  esModuleInterop, skipLibCheck, resolveJsonModule), `include:["src/**/*.ts","test/**/*.ts"]`.
- `config.ts`: `DEVDIGEST_API_URL`(def `http://localhost:3001`), `WAIT_TIMEOUT_MS`(def 120000),
  `HTTP_TIMEOUT_MS`(def ~15000).
- `log.ts`: усе через stderr — ніколи stdout.
- `types.ts`: `AgentLite`, `RepoLite{id,full_name}`, `PrLite{id,number}`,
  `RunLite{run_id,status,error}`, `ReviewLite{run_id,verdict,score,findings[]}`,
  `FindingLite{severity,title,file,start_line,end_line,category,confidence}`,
  `ConventionLite{rule,category,accepted}`. НЕ імпортувати `@devdigest/shared`.
- `api-client.ts`: base URL, `AbortSignal.timeout`, JSON, мапінг помилок у actionable
  (offline → "dev-digest API не відповідає на <url> — запустіть server (`pnpm dev`)"; 404;
  429; 5xx). Структуровані результати, без throw у happy-path.
- `resolve.ts`: `resolveRepo`, `resolvePr` (врах. nullish `id` → "PR #N ще не імпортовано"),
  `resolveAgent` (enabled-narrowing + error-forward, рішення №5).
- `tools/tool.ts`: `ToolDef` (`name`, one-line `description`, zod `inputSchema`, `handler`,
  `annotations`).
- Verify: `cd mcp && npm run typecheck`

### T2 — Read-only tools (після T1, ‖ T3)
Files: `src/tools/list-agents.ts`, `get-findings.ts`, `get-conventions.ts`,
`get-blast-radius.ts` (усі `readOnlyHint:true`).
- `list_agents`: input `{}`; GET /agents; компакт `name,provider,model,enabled,description`.
- `get_findings`: input `{repo,pr}`; resolve→GET /pulls/:id/reviews; агрегувати findings по
  ВСІХ `kind:'review'` (відкриті=`dismissed_at===null`); компакт finding без rationale/
  suggestion; + `verdict`/`score` з останнього review.
- `get_conventions`: input `{repo}`; resolve→GET /repos/:id/conventions; компакт
  `rule,category,accepted`.
- `get_blast_radius`: input `{repo,pr}`; стаб `{status:'not_implemented',hint}`; до API не
  звертається.
- Verify: `cd mcp && npm run typecheck`

### T3 — run_review (після T1, ‖ T2)
Files: `src/tools/run-review.ts`, `src/tools/wait-for-run.ts`.
- `wait-for-run.ts`: polling GET /pulls/:prId/runs, backoff 1s→cap ~5s до `WAIT_TIMEOUT_MS`;
  match по `run_id`; повертає при `done|failed|cancelled` або `still-running` по таймауту.
- `run-review.ts`: `readOnlyHint:false`, `openWorldHint:true`; input `{repo,pr,agent}`;
  resolve×3 → POST /pulls/:prId/review {agentId} → `runs[0].run_id` → waitForRun; гілки
  done/timeout/failed як у потоці; 429 → зрозуміле "review rate-limited (10/min)".
- Verify: `cd mcp && npm run typecheck`

### T4 — Bootstrap + Claude Code docs (після T2+T3)
Files: `src/index.ts` (create), `README.md` (доповнити).
- `index.ts`: `McpServer` з короткими `instructions`, `StdioServerTransport`, реєстрація
  рівно 5 tools, stderr-логер, graceful shutdown. Без Resources/Prompts.
- README: сніпет реєстрації в **Claude Code** (`claude mcp add` / `.mcp.json`), напр.:
  ```json
  { "mcpServers": { "dev-digest": {
    "command": "npx", "args": ["-y","tsx","<abs>/dev-digest/mcp/src/index.ts"],
    "env": { "DEVDIGEST_API_URL": "http://localhost:3001" } } } }
  ```
  + примітка: потрібен запущений `@devdigest/api` (`pnpm dev` у server/).
- Verify: `cd mcp && npm run typecheck`; smoke: `npx tsx src/index.ts` стартує, stdout чистий.

### T5 — Тести (останнім)
Files: `mcp/test/*.test.ts` (+ `vitest.config.ts` за потреби).
- Contract на inputSchema кожного tool (плоскі скаляри; валід/невалід).
- Happy-path з мокнутим `fetch`/api-client (фікстури `/agents`,`/repos`,`/repos/:id/pulls`,
  `/pulls/:id/reviews`,`/repos/:id/conventions`,`/pulls/:id/review`,`/pulls/:id/runs`).
- `resolve`: not-found і **>1 agent** (enabled-narrowing + error-forward).
- `run_review`: done→findings; timeout→`{runId,status:'running',hint}`; failed→error-forward
  (короткий `WAIT_TIMEOUT_MS` у тесті).
- `get_findings`: агрегація по кількох review-рядках.
- `get_blast_radius`: `not_implemented`, до API не звертається.
- **Фікстури звірені з реальними відповідями API** (contract-guard проти дрейфу `*Lite` і
  реплікованого доменного правила `get_findings` — див. Risks). Бажано зняти їх із живого
  seed-API один раз, а не вигадувати вручну.
- Verify: `cd mcp && npm run typecheck && npm test`

### T6 — (ОПЦІЙНО, рішення відкладене) Легкий lookup-ендпоінт `pr number → prId`
> **Default: OFF.** Не робимо, поки GitHub-синк на резолві реально не заважає. MCP і без
> цього працює (через наявний `GET /repos/:id/pulls`). Приймаємо T6 лише як оптимізацію.

Мотивація: прибрати важкий GitHub-синк із гарячого шляху резолву в `run_review`/`get_findings`.
**Це зміна в `server/` → мусить відповідати onion (`server-architecture` skill):**
- **Module:** `server/src/modules/pulls`.
- **Layer — HTTP:** новий роут `GET /repos/:id/pulls/:number` у `pulls/routes.ts` (parse/
  validate params, delegate, serialize). Workspace-scoped через `getContext`.
- **Layer — data:** читає **лише persisted-дані** прямим `container.db`-запитом **у роуті**,
  дзеркалячи наявний патерн модуля (`pulls` НЕ має `service.ts`/`repository.ts` — `routes.ts`
  звертається до `container.db` напряму, 22 виклики; існуючий `GET /repos/:id/pulls` — теж
  «товстий» роут). **БЕЗ** виклику `container.github()` — жодного синку. Повертає `PrMeta`
  або 404. НЕ вводити самотній repository-шар — це порушило б консистентність модуля.
- **Dependency rule:** route → `container.db`; не торкається адаптерів (`container.github`).
  Onion dependency-rule дотриманий; узгоджено з фактичним патерном `pulls`.
- **MCP-бік:** `resolvePr` перемикається на цей ендпоінт (одна зміна в `resolve.ts`).
- **Тести:** happy-path (знайдено/404) + перевірка, що GitHub-адаптер НЕ викликається.
- **Shared-контракт:** `PrMeta` уже існує — змін контрактів немає.
- **Depends on:** нічого (незалежний від T1–T5); MCP-перемикання — після T1.
- **Verify:** `cd server && pnpm typecheck && pnpm test`; MCP-бік — `cd mcp && npm run typecheck`.

## Карта паралельності
T1 → (T2 ‖ T3) → T4 → T5. T2 і T3 не мають спільних редагованих файлів;
`config/log/types/api-client/resolve/tool.ts` — read-only залежності з T1.
**T6 — опційна, поза цим потоком** (сервер + одна правка `resolve.ts`); default OFF.

## Shared-contract changes
**None.** MCP не імпортує `@devdigest/shared` і не торкається
`server/src/vendor/shared/contracts/*` чи його client-мірору.

## End-to-end verification
1. Підняти стек: Postgres (docker-compose) + `server/` (`pnpm dev`, :3001) + seed.
2. `cd mcp && npm run typecheck && npm test` — зелено.
3. Ручний прогін проти живого API: `list_agents`; `get_conventions repo=<seed>`;
   `run_review repo=<seed> pr=<#> agent=<name>` → `{verdict,findings[]}` або graceful timeout;
   `get_findings repo=<seed> pr=<#>`; `get_blast_radius` → `not_implemented`.
4. Перевірити, що stdout містить лише MCP-протокол (діагностика — у stderr).

## Risks / open questions
- **`get_findings` реплікує серверне доменне правило (свідомий борг).** «Відкриті findings =
  `dismissed_at===null`, агрегувати по ВСІХ `kind:'review'`-рядках» — це правило живе на
  сервері (`reviews/run-executor.ts:218`, `server/INSIGHTS.md` 2026-06-30), а MCP його
  повторює. Якщо сервер змінить визначення «живого» finding (напр. додасть `superseded_at`),
  MCP **тихо** розійдеться — `*Lite`-типи цього не зловлять. Пом'якшення: T5 тримає контрактні
  фікстури, узгоджені з реальними відповідями API; за потреби — серверний ендпоінт, що вже
  повертає агреговані відкриті findings (тоді правило не дублюється). Приймаємо як борг.
- **Дрейф `*Lite`-типів — свідомий tradeoff, не строгий плюс.** Відмова від `@devdigest/shared`
  архітектурно виправдана (уникаємо третього ручного мірору — root INSIGHTS 2026-06-29), але
  залишковий ризик реальний: при зміні *серверного* контракту (напр. полів
  `ReviewDtoFinding`) `*Lite` стануть застарілими без сигналу, `tsc` не зловить. Пом'якшення:
  MCP читає лише компактну read-only-проєкцію + graceful degradation проти живого API → дрейф
  спливає в рантаймі, а не мовчить; T5-фікстури узгоджені з реальними відповідями.
- **MVP зчеплений з `LocalNoAuthProvider`.** Резолвери/інструменти покладаються на default
  workspace без auth-заголовка (коректно для MVP). Коли сервер увімкне реальну автентифікацію,
  MCP зламається без сигналу — потрібен буде механізм токена. Відоме припущення.
- **Резолв `pr number → prId` тягне GitHub-синк** (`GET /repos/:id/pulls`) — повільно/
  залежно від токена. Default — приймаємо як є (offline-fallback існує). Оптимізація —
  опційний **T6** (onion-коректний persisted-only lookup). Рішення відкладене.
- **PR не імпортовано:** `PrMeta.id` nullish → hint "відкрийте PR у застосунку". Окремого
  `list_pulls` немає свідомо (тримаємо 5 tools).
- **Run ніколи не завершується:** покрито timeout→`{status:'running'}`, поріг 120с.
- **API offline:** api-client → actionable-повідомлення.
- **Версії залежностей** (`@modelcontextprotocol/sdk`, tsx/vitest/typescript) — узгодити з
  `e2e/`/`server/` під час `npm install`.
- **Запуск:** `npx tsx src/index.ts` (конвенція репо — споживання з source через tsx). Якщо
  цільове середовище без tsx/мережі — можливо локальний bin (підтвердити перед T4).
