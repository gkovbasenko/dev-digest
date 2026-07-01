---
name: adapters
description: Adapter pattern — interface contract, implementation rules, error wrapping, existing adapters
metadata:
  tags: adapters, external-integrations, interfaces, github, git, llm
---

# Adapter Pattern

Adapters sit at the outermost edge of the onion. Each one wraps exactly one external dependency (SDK, CLI, service) and exposes a narrow interface that the rest of the codebase depends on.

## Interface-first

All interfaces live in `vendor/shared/adapters.ts`. Write the interface first, then the implementation.

```ts
// vendor/shared/adapters.ts
export interface GitHubClient {
  getPr(owner: string, repo: string, number: number): Promise<PrMeta>
  listPrFiles(owner: string, repo: string, number: number): Promise<PrFile[]>
}
```

The service/container never imports the concrete class — only the interface type.

## Adapter implementation rules

1. **One adapter file → one external dependency.** Never mix Octokit and Anthropic in the same file.
2. **No business logic.** The adapter maps the external API shape to the internal interface shape. Any transformation beyond that goes in `helpers.ts` or the service.
3. **Wrap errors** as `ExternalServiceError` from `platform/errors.ts`:
   ```ts
   try {
     return await octokit.pulls.get(...)
   } catch (err) {
     throw new ExternalServiceError('GitHub', 'getPr', err)
   }
   ```
4. **Use `withRetry` / `withTimeout`** from `platform/resilience.ts` around any network call:
   ```ts
   return withRetry(() => this.octokit.pulls.get(...), { attempts: 3 })
   ```
5. **Constructor receives config/credentials only** — no container, no Db:
   ```ts
   export class OctokitGitHubClient implements GitHubClient {
     constructor(private token: string) {
       this.octokit = new Octokit({ auth: token })
     }
   }
   ```

## Existing adapters

| Path | Interface | External dep |
|---|---|---|
| `adapters/llm/anthropic.ts` | `LLMProvider` | `@anthropic-ai/sdk` |
| `adapters/llm/openai.ts` | `LLMProvider` | `openai` |
| `adapters/llm/pricing.ts` | `PriceBook` | static + OpenRouter REST |
| `adapters/github/octokit.ts` | `GitHubClient` | `@octokit/rest` |
| `adapters/git/simple-git.ts` | `GitClient` | `simple-git` |
| `adapters/git/diff-parser.ts` | — | internal (parses unified diff) |
| `adapters/astgrep/index.ts` | `CodeIndex` | `@ast-grep/napi` |
| `adapters/codeindex/ripgrep.ts` | `CodeSearch` | `ripgrep` CLI |
| `adapters/embedder/openai.ts` | `Embedder` | `openai` (embeddings) |
| `adapters/tokenizer/index.ts` | `Tokenizer` | `js-tiktoken` |
| `adapters/secrets/local.ts` | `SecretsProvider` | `~/.devdigest/secrets.json` |
| `adapters/auth/local.ts` | `AuthProvider` | — (MVP: fixed workspace) |
| `adapters/depgraph/index.ts` | `DepGraph` | `dependency-cruiser` |

## Mock adapters for tests

`adapters/mocks.ts` exports in-memory implementations of every interface. Use them in tests via the container override pattern (see `container.md`). Never use `vi.mock()` on the adapter module path — override through the container.

## Adding a new adapter

1. Add the interface to `vendor/shared/adapters.ts`
2. Create `adapters/<name>/index.ts` implementing the interface
3. Add a mock in `adapters/mocks.ts`
4. Register in `platform/container.ts` (lazy getter or async getter)
5. Export from `adapters/index.ts` barrel

## Secrets

Adapters that need credentials read them at construction time from `SecretsProvider`, resolved via `container.secrets`. They do not call `process.env` directly — all env access is in `platform/config.ts`.
