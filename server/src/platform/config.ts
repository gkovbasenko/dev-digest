import 'dotenv/config';
import { z } from 'zod';
import { homedir } from 'node:os';
import { join, isAbsolute, resolve } from 'node:path';
import { ContextBadge } from '@devdigest/shared';

/**
 * Central, zod-validated environment config. Loaded once at startup.
 *
 * NOTE: secret keys (OPENAI/ANTHROPIC/OPENROUTER/GITHUB_TOKEN) are deliberately
 * NOT in this schema. Feature code must access secrets through SecretsProvider,
 * never via process.env or AppConfig — the SecretsProvider is the one chokepoint
 * that reads process.env directly (see adapters/secrets/local.ts). Listing them
 * here would be dead config that never reaches AppConfig.
 */
const EnvSchema = z.object({
  DATABASE_URL: z
    .string()
    .default('postgres://devdigest:devdigest@localhost:5432/devdigest'),
  // Memory/RAG embeddings run on OpenAI (text-embedding-3-small, 1536-dim — the
  // pgvector columns are locked to that). Default OFF so the app makes ZERO
  // OpenAI requests; set EMBEDDINGS_ENABLED=true to turn memory retrieval on.
  EMBEDDINGS_ENABLED: z.string().optional(),
  // repo-intel facade (Tier 1). Default ON — reviews get repo skeleton +
  // callers context. Set REPO_INTEL_ENABLED=false to opt out, in which case
  // every consumer degrades to ripgrep-identical behavior (acceptance #10).
  // Note: even when on, sections only populate once the repo is indexed; an
  // unindexed repo degrades gracefully. Per-agent override: agents.repo_intel.
  REPO_INTEL_ENABLED: z.string().optional(),
  // Project Context folder — comma-separated top-level (or nested) folder
  // names whose `.md` docs are discoverable/attachable. Badge is derived from
  // whichever of these is the file's nearest enclosing ancestor folder. The
  // supported set in v1 is closed to `specs`/`docs`/`insights` (ContextBadge)
  // — any other name is dropped at load time (see `loadConfig`), not widened.
  PROJECT_CONTEXT_ROOTS: z.string().optional(),
  API_PORT: z.coerce.number().int().default(3001),
  WEB_PORT: z.coerce.number().int().default(3000),
  DEVDIGEST_CLONE_DIR: z.string().optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // `.env` (and .env.example) ship `LOG_LEVEL=` empty; an empty string is not a
  // valid enum member, so coerce '' → undefined to fall through to the default.
  LOG_LEVEL: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
  ),
});

export type AppConfig = {
  databaseUrl: string;
  apiPort: number;
  webPort: number;
  /** Absolute path where repos are cloned (~/.devdigest/workspace by default). */
  cloneDir: string;
  /** Absolute path to the writable secrets store (BYO keys from the UI). */
  secretsPath: string;
  nodeEnv: 'development' | 'test' | 'production';
  logLevel: string;
  /** Allowed CORS origin for the Next.js dev server. */
  webOrigin: string;
  /** Whether memory/RAG embeddings (OpenAI) are enabled. Default false. */
  embeddingsEnabled: boolean;
  /**
   * Whether the repo-intel facade (Tier 1: phantom-gate, callers-in-prompt) is
   * active. Default ON — set REPO_INTEL_ENABLED=false to opt out, in which case
   * every facade method returns its degraded result (`[]`) so consumers behave
   * EXACTLY like the ripgrep-only baseline.
   */
  repoIntelEnabled: boolean;
  /**
   * Top-level folder names whose `.md` docs populate the Project Context
   * page. Always a non-empty subset of `ContextBadge` (`specs`/`docs`/
   * `insights`) — `loadConfig` drops any configured name outside that closed
   * enum (with a one-time warning) and falls back to all three if the
   * filtered result would otherwise be empty.
   */
  projectContextRoots: string[];
};

const DEFAULT_PROJECT_CONTEXT_ROOTS: string[] = [...ContextBadge.options];

/**
 * Parse `PROJECT_CONTEXT_ROOTS` into a validated, non-empty root list (S2).
 * `deriveBadge` (context/service.ts) only ever recognizes names that also
 * parse as `ContextBadge` — so an operator-configured name outside that
 * closed enum (e.g. `adr,rfcs`) previously passed `roots.has(seg)` but then
 * silently failed the badge parse, leaving `discover()` return
 * `{ indexed: true, documents: [] }` with no error even though the name was
 * accepted as "configured." Filtering here, once, at load time keeps the
 * knob honest with what it can actually do: drop unsupported names (with a
 * one-time warning naming them) and fall back to the full default set if
 * filtering would otherwise leave the list empty.
 */
function resolveProjectContextRoots(raw: string | undefined): string[] {
  if (!raw) return DEFAULT_PROJECT_CONTEXT_ROOTS;
  const candidates = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const valid: string[] = [];
  const dropped: string[] = [];
  for (const candidate of candidates) {
    const parsed = ContextBadge.safeParse(candidate);
    if (parsed.success) valid.push(parsed.data);
    else dropped.push(candidate);
  }

  if (dropped.length > 0) {
    console.warn(
      `[config] PROJECT_CONTEXT_ROOTS: ignoring unsupported folder name(s) ${dropped.join(', ')} — the supported set in v1 is ${ContextBadge.options.join('/')}.`,
    );
  }

  return valid.length > 0 ? valid : DEFAULT_PROJECT_CONTEXT_ROOTS;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.parse(env);
  const cloneDirRaw =
    parsed.DEVDIGEST_CLONE_DIR ?? join(homedir(), '.devdigest', 'workspace');
  const cloneDir = isAbsolute(cloneDirRaw) ? cloneDirRaw : resolve(process.cwd(), cloneDirRaw);
  return {
    databaseUrl: parsed.DATABASE_URL,
    apiPort: parsed.API_PORT,
    webPort: parsed.WEB_PORT,
    cloneDir,
    secretsPath: join(homedir(), '.devdigest', 'secrets.json'),
    nodeEnv: parsed.NODE_ENV,
    logLevel: parsed.LOG_LEVEL ?? (parsed.NODE_ENV === 'test' ? 'silent' : 'info'),
    webOrigin: `http://localhost:${parsed.WEB_PORT}`,
    embeddingsEnabled: parsed.EMBEDDINGS_ENABLED === 'true',
    repoIntelEnabled: parsed.REPO_INTEL_ENABLED !== 'false',
    projectContextRoots: resolveProjectContextRoots(parsed.PROJECT_CONTEXT_ROOTS),
  };
}
