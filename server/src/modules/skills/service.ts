import type { Container } from '../../platform/container.js';
import type { Skill, SkillType, SkillSource, SkillVersion, SkillStats } from '@devdigest/shared';
import { SkillsRepository } from './repository.js';
import { fetchSkillUrl } from './fetch-skill.js';
import { UNTRUSTED_SKILL_START, UNTRUSTED_SKILL_END } from './constants.js';
import type { SkillRow, SkillVersionRow } from '../../db/rows.js';

export interface CreateSkillInput {
  name: string;
  description?: string;
  type?: SkillType;
  body: string;
  enabled?: boolean;
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
}

export interface ImportSkillInput {
  markdown?: string;
  url?: string;
  name?: string;
}

function toSkillDto(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as SkillType,
    source: row.source as SkillSource,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: (row.evidenceFiles as string[] | null) ?? null,
  };
}

// NOT the same as reviewer-core's `<untrusted>` wrapper — this format is
// invisible to assemblePrompt's INJECTION_GUARD. It only gates the "needs
// vetting" UI badge. Never feed this wrapped body into an agent prompt
// as-is; see the warning on UNTRUSTED_SKILL_START/END in constants.ts.
function wrapUntrusted(body: string): string {
  return `${UNTRUSTED_SKILL_START}\n${body}\n${UNTRUSTED_SKILL_END}`;
}

function extractNameFromBody(body: string): string | undefined {
  const match = body.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim();
}

function toSkillVersionDto(row: SkillVersionRow): SkillVersion {
  return {
    version: row.version,
    body: row.body,
    created_at: row.createdAt.toISOString(),
  };
}

export class SkillsService {
  private repo: SkillsRepository;

  constructor(private container: Container) {
    this.repo = new SkillsRepository(container.db);
  }

  async list(workspaceId: string): Promise<Skill[]> {
    const rows = await this.repo.list(workspaceId);
    return rows.map(toSkillDto);
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    return row ? toSkillDto(row) : undefined;
  }

  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    const row = await this.repo.insert({
      workspaceId,
      name: input.name,
      description: input.description,
      type: input.type ?? 'custom',
      source: 'manual',
      body: input.body,
      enabled: input.enabled ?? true,
    });
    return toSkillDto(row);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkillInput,
  ): Promise<Skill | undefined> {
    const row = await this.repo.update(workspaceId, id, patch);
    return row ? toSkillDto(row) : undefined;
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  async listVersions(workspaceId: string, id: string): Promise<SkillVersion[] | undefined> {
    const rows = await this.repo.listVersions(workspaceId, id);
    return rows ? rows.map(toSkillVersionDto) : undefined;
  }

  async getStats(workspaceId: string, id: string): Promise<SkillStats | undefined> {
    const stats = await this.repo.getStats(workspaceId, id);
    if (!stats) return undefined;
    return {
      agent_count: stats.agentCount,
      version_count: stats.versionCount,
      run_usage_count: stats.runUsageCount,
      last_used_at: stats.lastUsedAt ? stats.lastUsedAt.toISOString() : null,
      source: stats.source,
      created_at: stats.createdAt.toISOString(),
    };
  }

  // Restoring an old version reuses SkillsRepository.update() rather than
  // reimplementing the version-bump / concurrency-safe path (see
  // server/INSIGHTS.md 2026-07-01 — SELECT ... FOR UPDATE). Restoring v1 while
  // at v5 writes a NEW version (v6) whose body equals v1's — history is never
  // rewritten, only appended to.
  async restore(workspaceId: string, id: string, version: number): Promise<Skill | undefined> {
    const body = await this.repo.getVersionBody(workspaceId, id, version);
    if (body === undefined) return undefined;
    const row = await this.repo.update(workspaceId, id, { body });
    return row ? toSkillDto(row) : undefined;
  }

  async import(workspaceId: string, input: ImportSkillInput): Promise<Skill> {
    let rawBody: string;
    let source: SkillSource;

    if (input.url) {
      rawBody = await fetchSkillUrl(input.url);
      source = 'imported_url';
    } else {
      rawBody = input.markdown!;
      source = 'imported_markdown';
    }

    const name = input.name?.trim() || extractNameFromBody(rawBody) || 'Imported Skill';
    const body = wrapUntrusted(rawBody);

    const row = await this.repo.insert({
      workspaceId,
      name,
      description: '',
      type: 'custom',
      source,
      body,
      enabled: false,
    });
    return toSkillDto(row);
  }
}
