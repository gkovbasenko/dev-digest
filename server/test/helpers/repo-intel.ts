import type {
  RepoIntel,
  IndexState,
  IndexResult,
  BlastResult,
  RepoMapResult,
  SymbolRow,
  SignatureRow,
  RefRow,
  FileRankRow,
} from '../../src/modules/repo-intel/types.js';

/**
 * Minimal in-memory `RepoIntel` mock for tests that only exercise the
 * onboarding-relevant surface (`getIndexState`, `getTopFilesByRank`,
 * `getCriticalPaths`, `getFileRank`). Every other method returns an inert
 * empty/degraded value — no test in this suite calls them.
 */
export interface MockRepoIntelOptions {
  indexState?: Partial<IndexState>;
  topFiles?: string[];
  criticalPaths?: string[][];
  /** Universe of paths `getFileRank` recognizes as indexed (AC-7's grounding oracle). */
  indexedPaths?: string[];
}

export class MockRepoIntel implements RepoIntel {
  constructor(private opts: MockRepoIntelOptions = {}) {}

  async indexRepo(): Promise<IndexResult> {
    throw new Error('MockRepoIntel.indexRepo not implemented — not exercised by onboarding tests');
  }

  async refreshIndex(): Promise<IndexResult> {
    throw new Error('MockRepoIntel.refreshIndex not implemented — not exercised by onboarding tests');
  }

  async getIndexState(repoId: string): Promise<IndexState> {
    return {
      repoId,
      status: 'full',
      filesIndexed: 10,
      filesSkipped: 0,
      durationMs: 0,
      lastIndexedSha: 'sha-a',
      indexerVersion: 1,
      updatedAt: new Date(0),
      ...this.opts.indexState,
    };
  }

  async getBlastRadius(): Promise<BlastResult> {
    return { changedSymbols: [], callers: [], impactedEndpoints: [] };
  }

  async getRepoMap(): Promise<RepoMapResult> {
    return { text: '', tokens: 0, cached: false };
  }

  async getFileRank(_repoId: string, paths: string[]): Promise<FileRankRow[]> {
    const universe = new Set(this.opts.indexedPaths ?? this.opts.topFiles ?? []);
    return paths.filter((p) => universe.has(p)).map((p) => ({ path: p, percentile: 90 }));
  }

  async getSymbolsInFiles(): Promise<SymbolRow[]> {
    return [];
  }

  async getCallerSignatures(): Promise<SignatureRow[]> {
    return [];
  }

  async getUnresolvedReferences(): Promise<RefRow[]> {
    return [];
  }

  async getConventionSamples(): Promise<string[]> {
    return [];
  }

  async getTopFilesByRank(): Promise<string[]> {
    return this.opts.topFiles ?? [];
  }

  async getCriticalPaths(): Promise<string[][]> {
    return this.opts.criticalPaths ?? [];
  }
}
