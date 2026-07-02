import { readFile, realpath } from 'node:fs/promises';
import { z } from 'zod';
import type { Container } from '../../platform/container.js';
import type { ConventionCandidate, SkillType } from '@devdigest/shared';
import { ConventionCategory } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { ConventionsRepository, type InsertConvention } from './repository.js';
import {
  buildConventionsPrompt,
  buildSkillBody,
  isWithinRoot,
  resolveClonePath,
  toConventionDto,
  verifyEvidence,
} from './helpers.js';
import { CONFIG_FILE_CANDIDATES, SOURCE_SAMPLE_COUNT } from './constants.js';

const RawCandidate = z.object({
  rule: z.string().min(1),
  category: ConventionCategory.nullable().optional(),
  evidence_path: z.string().min(1),
  evidence_line: z.number().int().min(1),
  evidence_snippet: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

const RawCandidates = z.object({ candidates: z.array(RawCandidate) });

export interface UpdateConventionInput {
  rule?: string;
  category?: string | null;
  accepted?: boolean;
  rejected?: boolean;
}

export interface SkillBundle {
  name: string;
  description: string;
  type: SkillType;
  body: string;
}

/**
 * resolveClonePath alone is a syntactic check — it doesn't touch the
 * filesystem, so it can't catch a symlink committed INSIDE the clone that
 * points OUTSIDE it (`git clone` materializes a committed symlink as a real
 * one on checkout). realpath() resolves every symlink in the chain to its
 * true target, so re-checking containment against the real paths is the
 * actual read boundary. Exported for direct (no-DB) unit testing.
 */
export async function resolveRealClonePath(clonePath: string, file: string): Promise<string | null> {
  const resolved = resolveClonePath(clonePath, file);
  if (!resolved) return null;
  try {
    const [root, real] = await Promise.all([realpath(clonePath), realpath(resolved)]);
    return isWithinRoot(root, real) ? real : null;
  } catch {
    return null; // doesn't exist, broken symlink, permission error, etc.
  }
}

async function readCloneFile(clonePath: string, file: string): Promise<string | null> {
  const real = await resolveRealClonePath(clonePath, file);
  if (!real) return null;
  return readFile(real, 'utf8').catch(() => null);
}

export class ConventionsService {
  private repo: ConventionsRepository;

  constructor(private container: Container) {
    this.repo = new ConventionsRepository(container.db);
  }

  async list(workspaceId: string, repoId: string): Promise<ConventionCandidate[]> {
    const rows = await this.repo.list(workspaceId, repoId);
    return rows.map(toConventionDto);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateConventionInput,
  ): Promise<ConventionCandidate | undefined> {
    const row = await this.repo.update(workspaceId, id, patch);
    return row ? toConventionDto(row) : undefined;
  }

  async extract(workspaceId: string, repoId: string): Promise<ConventionCandidate[]> {
    const clonePath = await this.repo.getRepoClonePath(workspaceId, repoId);
    if (!clonePath) throw new ValidationError('Repo is not cloned yet');

    const sourcePaths = await this.container.repoIntel.getConventionSamples(
      repoId,
      SOURCE_SAMPLE_COUNT,
    );
    if (sourcePaths.length === 0) {
      throw new ValidationError(
        'No indexed source files for this repo yet — run /repos/:id/resync first',
      );
    }

    const sources = await this.readSampled(clonePath, sourcePaths);
    const configs = await this.readSampled(clonePath, CONFIG_FILE_CANDIDATES);

    const { provider, model } = await resolveFeatureModel(this.container, workspaceId, 'conventions');
    const llm = await this.container.llm(provider);

    const messages = buildConventionsPrompt(sources, configs);
    const result = await llm.completeStructured<z.infer<typeof RawCandidates>>({
      model,
      schema: RawCandidates,
      schemaName: 'ConventionCandidates',
      messages,
      maxRetries: 2,
    });

    const rejectedRules = await this.repo.listRejectedRuleTexts(workspaceId, repoId);

    const toInsert: InsertConvention[] = [];
    for (const c of result.data.candidates) {
      if (rejectedRules.has(c.rule.trim().toLowerCase())) continue;

      const fileContent = await readCloneFile(clonePath, c.evidence_path);
      if (fileContent == null) continue; // evidence file doesn't exist in the clone

      const check = verifyEvidence(fileContent, c.evidence_line, c.evidence_snippet);
      if (!check.ok) continue;

      toInsert.push({
        workspaceId,
        repoId,
        rule: c.rule,
        category: c.category ?? null,
        evidencePath: c.evidence_path,
        evidenceSnippet: c.evidence_snippet,
        evidenceLine: c.evidence_line,
        confidence: c.confidence,
      });
    }

    const rows = await this.repo.insertMany(toInsert);
    return rows.map(toConventionDto);
  }

  async bundleIntoSkill(workspaceId: string, repoId: string): Promise<SkillBundle> {
    const rows = await this.repo.listAccepted(workspaceId, repoId);
    if (rows.length === 0) {
      throw new ValidationError('No accepted conventions to bundle for this repo yet');
    }
    return {
      name: 'repo-conventions',
      description: 'Coding conventions extracted from this repository.',
      type: 'convention',
      body: buildSkillBody(rows),
    };
  }

  private async readSampled(
    clonePath: string,
    paths: string[],
  ): Promise<{ path: string; content: string }[]> {
    const results = await Promise.all(
      paths.map(async (path) => ({ path, content: await readCloneFile(clonePath, path) })),
    );
    return results.filter((r): r is { path: string; content: string } => r.content != null);
  }
}
