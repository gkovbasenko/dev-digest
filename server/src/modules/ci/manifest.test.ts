import { describe, it, expect } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { AgentManifest } from '@devdigest/shared';
import { agentSlug, agentYaml, slugify, withIdSuffix } from './manifest.js';

const BASE_AGENT = {
  id: 'a1b2c3d4-0000-0000-0000-000000000001',
  name: 'Security Reviewer',
  provider: 'openrouter',
  model: 'anthropic/claude-3.5-sonnet',
  systemPrompt: 'Review the diff for security issues.',
  strategy: 'auto',
  ciFailOn: 'critical',
};

describe('slugify / withIdSuffix / agentSlug', () => {
  it('lowercases, hyphenates, and strips non-alphanumerics', () => {
    expect(slugify('Security Reviewer!!')).toBe('security-reviewer');
    expect(slugify('  Weird__Name--123 ')).toBe('weird-name-123');
  });

  it('falls back to a non-empty slug for an all-punctuation name', () => {
    expect(slugify('!!!')).toBe('item');
  });

  it('appends a short id-derived suffix so two similarly-named agents cannot collide', () => {
    const slugA = agentSlug({ id: 'aaaaaaaa-1111-1111-1111-111111111111', name: 'Reviewer' });
    const slugB = agentSlug({ id: 'bbbbbbbb-2222-2222-2222-222222222222', name: 'Reviewer' });
    expect(slugA).not.toBe(slugB);
    expect(slugA.startsWith('reviewer-')).toBe(true);
    expect(slugB.startsWith('reviewer-')).toBe(true);
  });

  it('withIdSuffix never produces an empty suffix, even for a degenerate id', () => {
    expect(withIdSuffix('x', '----')).toBe('x-x');
  });
});

describe('agentYaml (pure — AC-1/AC-2)', () => {
  it('produces YAML that AgentManifest.safeParse accepts, with the enabled skill slugs', () => {
    const yaml = agentYaml(BASE_AGENT, ['convention-checks-abc12345']);
    const parsed = parseYaml(yaml);
    const result = AgentManifest.safeParse(parsed);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Security Reviewer');
      expect(result.data.provider).toBe('openrouter');
      expect(result.data.model).toBe('anthropic/claude-3.5-sonnet');
      expect(result.data.system_prompt).toBe('Review the diff for security issues.');
      expect(result.data.skills).toEqual(['convention-checks-abc12345']);
      expect(result.data.strategy).toBe('auto');
      expect(result.data.ci_fail_on).toBe('critical');
    }
  });

  it('emits an empty skills array (not omitted/null) when the agent has no enabled skills', () => {
    const yaml = agentYaml(BASE_AGENT, []);
    const parsed = AgentManifest.safeParse(parseYaml(yaml));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.skills).toEqual([]);
  });

  it('throws loudly (does not silently ship an invalid manifest) when a required field is empty', () => {
    expect(() => agentYaml({ ...BASE_AGENT, name: '' }, [])).toThrow(/AgentManifest validation/);
  });

  it('is pure: same input always produces the same output', () => {
    const a = agentYaml(BASE_AGENT, ['foo']);
    const b = agentYaml(BASE_AGENT, ['foo']);
    expect(a).toBe(b);
  });
});
