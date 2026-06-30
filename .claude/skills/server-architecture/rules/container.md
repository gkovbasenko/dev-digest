---
name: container
description: DI container — resolving dependencies, adding new adapters, testing with overrides
metadata:
  tags: di, container, dependency-injection, testing
---

# DI Container (`platform/container.ts`)

The container is the **composition root** — the one place in the codebase that knows which concrete adapter implementation to use. Everything else talks to interfaces.

## Accessing the container

**In routes:** `app.container` (decorated onto the Fastify instance in `app.ts`)
**In services:** passed as constructor argument

```ts
// routes.ts
app.get('/agents', async (req) => {
  const { workspaceId } = await getContext(app.container, req)
  const agents = await new AgentService(app.container).list(workspaceId)
  return agents
})

// service.ts
export class AgentService {
  constructor(private container: Container) {}

  async list(workspaceId: string) {
    return this.container.agentsRepo.list(workspaceId)
  }
}
```

## What the container exposes

```ts
// Always-available (synchronous)
container.config         // AppConfig (validated env)
container.db             // Drizzle Db
container.secrets        // SecretsProvider
container.auth           // AuthProvider
container.jobs           // JobRunner
container.runBus         // RunBus (SSE pub/sub)

// Lazy adapters (getters — instantiated on first access)
container.git            // GitClient
container.codeIndex      // CodeIndex
container.repoIntel      // RepoIntel
container.depgraph       // DepGraph
container.tokenizer      // Tokenizer

// Async adapters (return Promise — call with await)
await container.github()        // GitHubClient (reads PAT from secrets)
await container.embedder()      // Embedder
await container.llm('openai')   // LLMProvider
await container.llm('anthropic')
await container.priceBook()     // PriceBook

// Cross-module shared repositories
container.agentsRepo     // AgentRepository
container.reviewRepo     // ReviewRepository (composite)
```

## Adding a new adapter

1. **Define the interface** in `vendor/shared/adapters.ts`:
   ```ts
   export interface SlackNotifier {
     send(channel: string, message: string): Promise<void>
   }
   ```

2. **Implement it** in `adapters/slack/index.ts`:
   ```ts
   import type { SlackNotifier } from '../../vendor/shared/adapters'

   export class SlackWebhookNotifier implements SlackNotifier {
     constructor(private webhookUrl: string) {}
     async send(channel: string, message: string) { /* ... */ }
   }
   ```

3. **Register in container** (`platform/container.ts`):
   ```ts
   get slack(): SlackNotifier {
     return this._slack ??= new SlackWebhookNotifier(this.config.slackWebhookUrl)
   }
   ```

4. **Use via container** in services only:
   ```ts
   await this.container.slack.send('#alerts', 'Review complete')
   ```

## Testing with overrides

The container accepts an `overrides` object in its constructor. Pass mocks there — never patch module internals.

```ts
// test file
const mockGithub: GitHubClient = {
  getPr: vi.fn().mockResolvedValue(mockPr),
  // ...
}

const container = new Container(testConfig, testDb, {
  github: mockGithub,
  llm: { openai: mockLlm },
})

const service = new ReviewService(container)
```

## Rules

- **Never** call `new SomeAdapter(...)` outside `container.ts`
- **Never** import an adapter class directly in a service or route
- **Always** access adapters through `container.*`, even if you could import the class
- Cross-module data access: use `container.agentsRepo` / `container.reviewRepo`, not a direct import of another module's repository class
