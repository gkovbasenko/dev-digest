/**
 * Human-readable identifier → uuid resolvers. Tools accept `repo` ('owner/name'),
 * `pr` (number), `agent` (name) — never raw uuids — and resolve them here against
 * the already-existing read endpoints. Every not-found/ambiguous branch names the
 * next useful tool to call ("error leads forward" — see plan's design principles).
 */
import { apiClient } from './api-client.js';
import type { AgentLite, PrLite, RepoLite } from './types.js';

export interface ResolveSuccess {
  ok: true;
  id: string;
}

export interface ResolveFailure {
  ok: false;
  error: string;
}

export type ResolveResult = ResolveSuccess | ResolveFailure;

/**
 * `owner/name` → repoId. `GET /repos` is a plain workspace-scoped list from the
 * DB — no GitHub sync, cheap (`server/src/modules/repos/routes.ts`).
 */
export async function resolveRepo(fullName: string): Promise<ResolveResult> {
  const res = await apiClient.get<RepoLite[]>('/repos');
  if (!res.ok) return { ok: false, error: res.error };

  const match = res.data.find((r) => r.full_name === fullName);
  if (!match) {
    return {
      ok: false,
      error:
        `Repo '${fullName}' not found in dev-digest (workspace has ${res.data.length} repo(s)). ` +
        'Check the owner/name spelling, or add the repo in the app first.',
    };
  }
  return { ok: true, id: match.id };
}

/**
 * PR number → prId within a repo. `GET /repos/:id/pulls` may perform a live
 * GitHub sync + backfill (slow without a configured token, graceful fallback
 * to persisted data otherwise — `server/src/modules/pulls/routes.ts`).
 * `PrMeta.id` is nullish for a PR GitHub returned but that hasn't been
 * persisted/imported yet.
 */
export async function resolvePr(repoId: string, number: number): Promise<ResolveResult> {
  const res = await apiClient.get<PrLite[]>(`/repos/${repoId}/pulls`);
  if (!res.ok) return { ok: false, error: res.error };

  const match = res.data.find((p) => p.number === number);
  if (!match) {
    return {
      ok: false,
      error: `PR #${number} not found for this repo. Check the number, or open the repo in the app to sync its PR list.`,
    };
  }
  if (match.id === null || match.id === undefined) {
    return {
      ok: false,
      error: `PR #${number} ще не імпортовано — відкрийте PR у застосунку, щоб імпортувати його, потім спробуйте знову.`,
    };
  }
  return { ok: true, id: match.id };
}

/**
 * Agent name → agentId. `agents.name` is NOT unique server-side (only
 * `notNull()` — `server/src/db/schema/agents.ts:13`), so ambiguity is a real
 * case, not a hypothetical:
 *  - exactly 1 match by name  → use it.
 *  - >1 match                 → narrow to `enabled:true`; if exactly one
 *                                remains, use it.
 *  - still 0 or >1 after that → actionable error listing every candidate
 *                                (`name · provider · model · enabled`) +
 *                                a pointer to `list_agents`. No silent
 *                                auto-pick, no disambiguator param (YAGNI).
 */
export async function resolveAgent(name: string): Promise<ResolveResult> {
  const res = await apiClient.get<AgentLite[]>('/agents');
  if (!res.ok) return { ok: false, error: res.error };

  const matches = res.data.filter((a) => a.name === name);
  if (matches.length === 0) {
    return {
      ok: false,
      error: `Agent '${name}' not found — call list_agents to see available agents.`,
    };
  }
  if (matches.length === 1) {
    return { ok: true, id: matches[0]!.id };
  }

  const enabledMatches = matches.filter((a) => a.enabled);
  if (enabledMatches.length === 1) {
    return { ok: true, id: enabledMatches[0]!.id };
  }

  const candidates = matches
    .map((a) => `${a.name} · ${a.provider} · ${a.model} · enabled=${a.enabled}`)
    .join('; ');
  return {
    ok: false,
    error:
      `Agent name '${name}' is ambiguous (${matches.length} agents share this name, ` +
      `${enabledMatches.length} enabled). Candidates: ${candidates}. ` +
      'Call list_agents for full details and either rename or enable exactly one.',
  };
}
