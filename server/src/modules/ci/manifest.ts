import { stringify } from 'yaml';
import { AgentManifest, type AgentManifestInput } from '@devdigest/shared';

/**
 * Pure agent-manifest serializer (AC-1/AC-2). No I/O — data in, YAML string
 * out. `agent-runner`'s `loadAgentManifest` validates the SAME `AgentManifest`
 * Zod schema on the way back in, so self-checking here (`safeParse` before
 * `stringify`) guarantees round-trip parity: a shape bug fails loudly at
 * export time instead of shipping a manifest the runner will reject in CI.
 */

export interface ManifestAgent {
  id: string;
  name: string;
  provider: string;
  model: string;
  systemPrompt: string;
  strategy: string;
  ciFailOn: string;
}

/** Lowercase, hyphenated, ASCII-only slug fragment. No uniqueness guarantee on its own. */
export function slugify(input: string): string {
  const s = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'item';
}

/**
 * Append a short id-derived suffix so two similarly-named entities (two
 * agents, two skills) never collide on the same `.devdigest/**\/<slug>.*`
 * path — `agent-runner`'s `findManifestPath` expects EXACTLY one manifest
 * file per bundle, and a path collision between two skill files would
 * silently drop one of them.
 */
export function withIdSuffix(slug: string, id: string): string {
  const suffix = id.replace(/-/g, '').slice(0, 8) || 'x';
  return `${slug}-${suffix}`;
}

/** Per-agent-unique manifest slug (`.devdigest/agents/<slug>.yaml`). */
export function agentSlug(agent: { id: string; name: string }): string {
  return withIdSuffix(slugify(agent.name), agent.id);
}

/**
 * Serialize one agent + its enabled skill slugs into the `AgentManifest` YAML
 * the studio writes and `agent-runner` reads back (AC-2).
 */
export function agentYaml(agent: ManifestAgent, enabledSkillSlugs: readonly string[]): string {
  const candidate: AgentManifestInput = {
    name: agent.name,
    provider: agent.provider as AgentManifestInput['provider'],
    model: agent.model,
    system_prompt: agent.systemPrompt,
    skills: [...enabledSkillSlugs],
    strategy: agent.strategy as AgentManifestInput['strategy'],
    ci_fail_on: agent.ciFailOn as AgentManifestInput['ci_fail_on'],
  };
  const parsed = AgentManifest.safeParse(candidate);
  if (!parsed.success) {
    throw new Error(`Generated agent manifest failed AgentManifest validation: ${parsed.error.message}`);
  }
  return stringify(parsed.data);
}
