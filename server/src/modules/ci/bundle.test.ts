import { describe, it, expect } from 'vitest';
import { buildBundle } from './bundle.js';

const INPUT = {
  manifestSlug: 'security-reviewer-abc12345',
  manifestYaml: 'name: Security Reviewer\n',
  skills: [
    { slug: 'convention-checks-11111111', body: 'Check conventions.' },
    { slug: 'security-basics-22222222', body: 'Check for secrets.' },
  ],
  runnerBundle: '/* stub agent-runner bundle */',
  workflowYaml: 'name: DevDigest Review\n',
};

describe('buildBundle (pure — AC-1/AC-3/AC-5/AC-6)', () => {
  it('places the manifest at .devdigest/agents/<slug>.yaml', () => {
    const files = buildBundle(INPUT);
    const manifest = files.find((f) => f.path === '.devdigest/agents/security-reviewer-abc12345.yaml');
    expect(manifest).toBeDefined();
    expect(manifest?.contents).toBe(INPUT.manifestYaml);
    expect(manifest?.editable).toBe(true);
  });

  it('places one .devdigest/skills/<slug>.md per enabled skill, in order', () => {
    const files = buildBundle(INPUT);
    expect(files.find((f) => f.path === '.devdigest/skills/convention-checks-11111111.md')?.contents).toBe(
      'Check conventions.',
    );
    expect(files.find((f) => f.path === '.devdigest/skills/security-basics-22222222.md')?.contents).toBe(
      'Check for secrets.',
    );
  });

  it('.devdigest/memory.jsonl is ALWAYS empty (AC-6 — no memory store exists)', () => {
    const files = buildBundle(INPUT);
    const memory = files.find((f) => f.path === '.devdigest/memory.jsonl');
    expect(memory?.contents).toBe('');
  });

  it('the runner bundle is non-editable; the manifest, skills, and workflow are editable', () => {
    const files = buildBundle(INPUT);
    const runner = files.find((f) => f.path === '.devdigest/runner/index.js');
    expect(runner?.contents).toBe(INPUT.runnerBundle);
    expect(runner?.editable).toBe(false);

    const workflow = files.find((f) => f.path === '.github/workflows/devdigest-review.yml');
    expect(workflow?.contents).toBe(INPUT.workflowYaml);
    expect(workflow?.editable).toBe(true);
  });

  it('emits no skill files when the agent has no enabled skills', () => {
    const files = buildBundle({ ...INPUT, skills: [] });
    expect(files.some((f) => f.path.startsWith('.devdigest/skills/'))).toBe(false);
  });

  it('is pure: same input always produces the same output', () => {
    expect(buildBundle(INPUT)).toEqual(buildBundle(INPUT));
  });
});
