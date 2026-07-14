import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { AgentManifest } from '../src/vendor/shared/index.js';
import { agentYaml } from '../src/modules/ci/manifest.js';
// Cross-package import (deliberately relative, not a tsconfig path alias —
// this file lives under `test/`, outside `tsconfig.json`'s `src/**/*.ts`
// `include` glob, so it never affects `pnpm typecheck`/`pnpm build`'s rootDir
// inference). Exercises the REAL `agent-runner` reader, not a reimplementation
// — the two contract/parity linchpins the plan calls out (AC-2). Requires
// `agent-runner`'s own deps installed (`cd agent-runner && pnpm install`).
import { loadAgentManifest } from '../../agent-runner/src/manifest.js';

/**
 * AC-2 — round-trip parity: the studio's `agentYaml` (this module) and
 * `agent-runner`'s `loadAgentManifest` (the CI reader) must both accept the
 * SAME bytes and deep-equal on the parsed result. If this ever diverges, a
 * manifest that validates in the studio would be rejected by the runner in
 * CI (or vice versa) — a shape bug that only shows up in a live PR.
 */
describe('AC-2 — manifest round-trip (studio agentYaml <-> agent-runner loadAgentManifest)', () => {
  it('agent-runner.loadAgentManifest accepts the studio-generated YAML and deep-equals the studio parse', () => {
    const agent = {
      id: 'c0ffee00-0000-0000-0000-000000000042',
      name: 'Round-Trip Reviewer',
      provider: 'openrouter',
      model: 'anthropic/claude-3.5-sonnet',
      systemPrompt: 'Review the diff for correctness and security issues.',
      strategy: 'auto',
      ciFailOn: 'critical',
    };
    const yaml = agentYaml(agent, ['convention-checks-abc12345']);

    // The studio side (AgentManifest.safeParse — same schema the export flow
    // self-checks against before returning the bundle). Re-parse the exact
    // bytes agent-runner will read, not the pre-stringify object, so both
    // sides genuinely read the SAME serialized artifact.
    const studioResult = AgentManifest.safeParse(parseYaml(yaml));
    expect(studioResult.success).toBe(true);

    // The CI side — write the manifest to disk exactly as an exported bundle
    // would, then run it through agent-runner's real reader.
    const dir = mkdtempSync(path.join(tmpdir(), 'devdigest-manifest-roundtrip-'));
    try {
      const agentsDir = path.join(dir, 'agents');
      mkdirSync(agentsDir, { recursive: true });
      const manifestPath = path.join(agentsDir, 'round-trip-reviewer.yaml');
      writeFileSync(manifestPath, yaml);

      const runnerResult = loadAgentManifest(manifestPath);

      expect(studioResult.success && studioResult.data).toEqual(runnerResult);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
