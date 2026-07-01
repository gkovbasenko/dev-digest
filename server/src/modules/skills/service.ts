import type { Container } from '../../platform/container.js';
import type { Skill, SkillType, SkillSource } from '@devdigest/shared';
import { SkillsRepository } from './repository.js';
import { UNTRUSTED_SKILL_START, UNTRUSTED_SKILL_END } from './constants.js';
import type { SkillRow } from '../../db/rows.js';

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

function wrapUntrusted(body: string): string {
  return `${UNTRUSTED_SKILL_START}\n${body}\n${UNTRUSTED_SKILL_END}`;
}

function extractNameFromBody(body: string): string | undefined {
  const match = body.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim();
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

  async import(workspaceId: string, input: ImportSkillInput): Promise<Skill> {
    let rawBody: string;
    let source: SkillSource;

    if (input.url) {
      const res = await fetch(input.url);
      if (!res.ok) {
        throw new Error(`Could not fetch skill URL: ${res.status} ${res.statusText}`);
      }
      rawBody = await res.text();
      source = 'imported_url';
    } else {
      rawBody = input.markdown!;
      source = 'manual';
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
