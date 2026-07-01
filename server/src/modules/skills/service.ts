import dns from 'node:dns/promises';
import net from 'node:net';
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

// Private/reserved IPv4 ranges (SSRF blocklist).
const BLOCKED_CIDRS: Array<{ base: number; mask: number }> = [
  { base: cidrBase('127.0.0.0'), mask: 0xff000000 },   // loopback
  { base: cidrBase('10.0.0.0'), mask: 0xff000000 },    // private
  { base: cidrBase('172.16.0.0'), mask: 0xfff00000 },  // private
  { base: cidrBase('192.168.0.0'), mask: 0xffff0000 }, // private
  { base: cidrBase('169.254.0.0'), mask: 0xffff0000 }, // link-local / cloud metadata
  { base: cidrBase('0.0.0.0'), mask: 0xff000000 },     // unspecified
];

function cidrBase(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) | parseInt(octet, 10), 0) >>> 0;
}

function isBlockedIPv4(ip: string): boolean {
  const addr = cidrBase(ip);
  return BLOCKED_CIDRS.some(({ base, mask }) => (addr & mask) >>> 0 === base);
}

function isBlockedIPv6(ip: string): boolean {
  // Normalise and block loopback + unique-local + link-local
  const norm = ip.toLowerCase().replace(/^\[|\]$/g, '');
  return norm === '::1' || norm.startsWith('fc') || norm.startsWith('fd') || norm.startsWith('fe80');
}

/**
 * Fetch a remote skill body with SSRF protections:
 *   - HTTPS only (no file://, ftp://, http://, etc.)
 *   - DNS resolved before fetch; blocked if IP is private/reserved
 *   - 10-second timeout
 *   - Response body capped at 1 MB
 */
async function fetchSkillUrl(rawUrl: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid skill URL');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Skill URL must use HTTPS');
  }

  // Resolve hostname → IP before connecting to detect SSRF targets.
  const { address, family } = await dns.lookup(parsed.hostname).catch(() => {
    throw new Error('Could not resolve skill URL hostname');
  });

  if (family === 4 && isBlockedIPv4(address)) {
    throw new Error('Skill URL resolves to a private or reserved address');
  }
  if (family === 6 && isBlockedIPv6(address)) {
    throw new Error('Skill URL resolves to a private or reserved address');
  }

  const MAX_BYTES = 1 * 1024 * 1024; // 1 MB

  const res = await fetch(rawUrl, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) {
    throw new Error(`Could not fetch skill URL: ${res.status} ${res.statusText}`);
  }

  // Read with a size cap to prevent memory exhaustion.
  const reader = res.body?.getReader();
  if (!reader) throw new Error('Empty response from skill URL');

  let total = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BYTES) {
      reader.cancel();
      throw new Error('Skill URL response exceeds 1 MB limit');
    }
    chunks.push(value);
  }

  return new TextDecoder().decode(
    chunks.reduce((acc, chunk) => {
      const merged = new Uint8Array(acc.length + chunk.length);
      merged.set(acc);
      merged.set(chunk, acc.length);
      return merged;
    }, new Uint8Array(0)),
  );
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
      rawBody = await fetchSkillUrl(input.url);
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
