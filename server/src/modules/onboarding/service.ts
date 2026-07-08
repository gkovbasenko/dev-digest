import type { Container } from '../../platform/container.js';
import type { OnboardingDoc, OnboardingSection } from '@devdigest/shared';
import { Onboarding } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { OnboardingRepository } from './repository.js';
import { buildOnboardingPrompt, readCloneFile, RawOnboarding, type SampledFile } from './helpers.js';
import { KEY_FILE_CANDIDATES, KEY_FILE_EXCERPT_MAX_CHARS, ONBOARDING_SECTION_KINDS, TOP_FILE_COUNT } from './constants.js';

export class OnboardingService {
  private repo: OnboardingRepository;

  constructor(private container: Container) {
    this.repo = new OnboardingRepository(container.db);
  }

  /**
   * Cached DB read — zero LLM calls (AC-23). `workspaceId` is accepted for
   * signature consistency with every other module service (all workspace
   * scoping flows through `getContext()`), though the `onboarding` table
   * itself is keyed by `repoId` alone (single-tenant MVP, no `workspaceId`
   * column — see server INSIGHTS 2026-07-02 on the current no-auth model).
   */
  async read(_workspaceId: string, repoId: string): Promise<OnboardingDoc> {
    const [row, indexState] = await Promise.all([
      this.repo.get(repoId),
      this.container.repoIntel.getIndexState(repoId),
    ]);
    const indexed = indexState.filesIndexed > 0;

    if (!row) {
      return { exists: false, indexed, stale: false, sections: [], generated_at: null, source_file_count: 0 };
    }

    // Defense-in-depth: row.json is jsonb (unknown at the type level). We are
    // the only writer, but re-validate against the contract rather than
    // trusting a manual-edit/migration to have kept it shaped correctly —
    // one corrupt row degrades to empty sections instead of a 500.
    const parsed = Onboarding.safeParse(row.json);
    const sections = parsed.success ? parsed.data.sections : [];
    const stale = row.generationSha !== indexState.lastIndexedSha;

    return {
      exists: true,
      indexed,
      stale,
      sections,
      generated_at: row.generatedAt.toISOString(),
      source_file_count: row.sourceFileCount ?? 0,
    };
  }

  /** Paid generation — exactly one `completeStructured` call (AC-1). */
  async regenerate(workspaceId: string, repoId: string): Promise<OnboardingDoc> {
    const startedAt = Date.now();
    const clonePath = await this.repo.getRepoClonePath(workspaceId, repoId);

    // Gate BEFORE any LLM call or write (AC-2): no clone, or no ranked files.
    const topFiles = clonePath
      ? await this.container.repoIntel.getTopFilesByRank(repoId, TOP_FILE_COUNT)
      : [];
    if (!clonePath || topFiles.length === 0) {
      throw new ValidationError(
        'Repo is not indexed yet — run /repos/:id/resync first',
      );
    }

    const [criticalPaths, keyFiles] = await Promise.all([
      this.container.repoIntel.getCriticalPaths(repoId),
      this.readKeyFiles(clonePath),
    ]);

    const { provider, model } = await resolveFeatureModel(this.container, workspaceId, 'onboarding');
    const llm = await this.container.llm(provider);

    const messages = await buildOnboardingPrompt({
      rankedFiles: topFiles,
      criticalPaths,
      keyFiles,
      language: 'English',
    });

    const result = await llm.completeStructured<RawOnboarding>({
      model,
      schema: RawOnboarding,
      schemaName: 'Onboarding',
      messages,
      maxRetries: 2,
    });

    // Ground every model-emitted path against the real index before persist
    // (AC-7) — drop any path getFileRank doesn't recognize as indexed.
    const allPaths = [...new Set(result.data.sections.flatMap((s) => s.links.map((l) => l.path)))];
    const rankRows = allPaths.length > 0 ? await this.container.repoIntel.getFileRank(repoId, allPaths) : [];
    const knownPaths = new Set(rankRows.map((r) => r.path));
    let droppedPathCount = 0;

    // Reorder to the fixed kind order (AC-3) and strip diagram off every
    // non-architecture section (AC-8) regardless of what the model returned.
    const orderedSections: OnboardingSection[] = ONBOARDING_SECTION_KINDS.map((kind) => {
      const raw = result.data.sections.find((s) => s.kind === kind);
      // superRefine on RawOnboarding already guarantees exactly one section
      // per kind, so `raw` is always defined here.
      const links = raw!.links.filter((l) => {
        const keep = knownPaths.has(l.path);
        if (!keep) droppedPathCount += 1;
        return keep;
      });
      return {
        kind: raw!.kind,
        title: raw!.title,
        body: raw!.body,
        diagram: kind === 'architecture' ? (raw!.diagram ?? null) : null,
        links,
      };
    });

    const indexState = await this.container.repoIntel.getIndexState(repoId);
    const generatedAt = new Date();
    const sourceFileCount = indexState.filesIndexed;

    await this.repo.upsert({
      repoId,
      json: { sections: orderedSections },
      generatedAt,
      generationSha: indexState.lastIndexedSha,
      sourceFileCount,
    });

    // Structured JSON, one line per generation — no secrets, repo-scoped.
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        event: 'onboarding.regenerate',
        repoId,
        provider,
        model,
        sourceFileCount,
        droppedPathCount,
        durationMs: Date.now() - startedAt,
      }),
    );

    return {
      exists: true,
      indexed: sourceFileCount > 0,
      stale: false,
      sections: orderedSections,
      generated_at: generatedAt.toISOString(),
      source_file_count: sourceFileCount,
    };
  }

  private async readKeyFiles(clonePath: string): Promise<SampledFile[]> {
    const results = await Promise.all(
      KEY_FILE_CANDIDATES.map(async (path) => ({ path, content: await readCloneFile(clonePath, path) })),
    );
    return results
      .filter((r): r is { path: string; content: string } => r.content != null)
      .map((r) => ({
        path: r.path,
        content:
          r.content.length > KEY_FILE_EXCERPT_MAX_CHARS
            ? r.content.slice(0, KEY_FILE_EXCERPT_MAX_CHARS)
            : r.content,
      }));
  }
}
