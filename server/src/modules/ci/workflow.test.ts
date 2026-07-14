import { describe, it, expect } from 'vitest';
import { workflowYaml } from './workflow.js';

describe('workflowYaml (pure — AC-1/AC-4)', () => {
  it('references secrets by NAME only, never a value (AC-24/AC-31)', () => {
    const yaml = workflowYaml({ triggers: ['opened'], postAs: 'github_review' });
    expect(yaml).toContain('OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}');
    expect(yaml).toContain('GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}');
    expect(yaml).not.toMatch(/sk-|ghp_|gho_/);
  });

  it('never uses a marketplace review action as the review mechanism (AC-4)', () => {
    const yaml = workflowYaml({ triggers: ['opened'], postAs: 'github_review' });
    expect(yaml).not.toMatch(/uses:\s*devdigest\/review-action@/);
    expect(yaml).toContain('run: node .devdigest/runner/index.js');
  });

  it('triggers on pull_request with the chosen types', () => {
    const yaml = workflowYaml({ triggers: ['opened', 'synchronize'], postAs: 'pr_comment' });
    expect(yaml).toContain('on:\n  pull_request:');
    expect(yaml).toContain('- opened');
    expect(yaml).toContain('- synchronize');
    expect(yaml).not.toContain('- reopened');
  });

  it('drops unrecognized trigger strings and falls back to the default set when none remain', () => {
    const yaml = workflowYaml({ triggers: ['totally-bogus'], postAs: 'none' });
    expect(yaml).toContain('- opened');
    expect(yaml).toContain('- synchronize');
    expect(yaml).toContain('- reopened');
    expect(yaml).not.toContain('- totally-bogus');
  });

  it('threads post_as into DEVDIGEST_POST_AS', () => {
    const yaml = workflowYaml({ triggers: ['opened'], postAs: 'none' });
    expect(yaml).toContain('DEVDIGEST_POST_AS: none');
  });

  it('is pure: same input always produces the same output', () => {
    const a = workflowYaml({ triggers: ['opened'], postAs: 'github_review' });
    const b = workflowYaml({ triggers: ['opened'], postAs: 'github_review' });
    expect(a).toBe(b);
  });
});
