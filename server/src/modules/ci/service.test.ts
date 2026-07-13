import { describe, it, expect } from 'vitest';
import type { WorkflowRun } from '@devdigest/shared';
import { mapRunStatus, parseOwnerRepo, stripUntrustedMarkers } from './service.js';
import { UNTRUSTED_SKILL_START, UNTRUSTED_SKILL_END } from '../skills/constants.js';

function run(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id: 1,
    status: 'completed',
    conclusion: 'success',
    prNumber: 42,
    htmlUrl: 'https://github.com/acme/widgets/actions/runs/1',
    ...overrides,
  };
}

describe('parseOwnerRepo', () => {
  it('splits "owner/name" into a RepoRef', () => {
    expect(parseOwnerRepo('acme/widgets')).toEqual({ owner: 'acme', name: 'widgets' });
  });

  it('rejects a repo string with no slash', () => {
    expect(() => parseOwnerRepo('acme-widgets')).toThrow(/Invalid repo/);
  });

  it('rejects a repo string with more than one slash', () => {
    expect(() => parseOwnerRepo('acme/widgets/extra')).toThrow(/Invalid repo/);
  });

  it('rejects an empty owner or name segment', () => {
    expect(() => parseOwnerRepo('/widgets')).toThrow(/Invalid repo/);
    expect(() => parseOwnerRepo('acme/')).toThrow(/Invalid repo/);
  });
});

describe('stripUntrustedMarkers', () => {
  it('strips the vetting markers from the boundaries', () => {
    const wrapped = `${UNTRUSTED_SKILL_START}\nBody text\n${UNTRUSTED_SKILL_END}`;
    expect(stripUntrustedMarkers(wrapped)).toBe('Body text');
  });

  it('leaves an already-clean body untouched', () => {
    expect(stripUntrustedMarkers('Just a normal skill body.')).toBe('Just a normal skill body.');
  });

  it('does not delete an occurrence of the marker text INSIDE the body', () => {
    const body = `${UNTRUSTED_SKILL_START}\nSee ${UNTRUSTED_SKILL_START} in docs.\n${UNTRUSTED_SKILL_END}`;
    expect(stripUntrustedMarkers(body)).toBe(`See ${UNTRUSTED_SKILL_START} in docs.`);
  });
});

describe('mapRunStatus (AC-22/AC-23)', () => {
  it('maps a still-executing run to "running" regardless of artifact', () => {
    expect(mapRunStatus(run({ status: 'in_progress' }), null)).toBe('running');
  });

  it('maps a completed run with no valid artifact to "failed"', () => {
    expect(mapRunStatus(run({ status: 'completed' }), null)).toBe('failed');
  });

  it('maps a zero-findings artifact to "no_findings" even on a failure conclusion', () => {
    const artifact = { findings_count: 0, cost_usd: 0, agent: 'Reviewer' };
    expect(mapRunStatus(run({ status: 'completed', conclusion: 'failure' }), artifact)).toBe(
      'no_findings',
    );
  });

  it('maps findings + a success conclusion to "succeeded"', () => {
    const artifact = { findings_count: 2, cost_usd: 0.01, agent: 'Reviewer' };
    expect(mapRunStatus(run({ status: 'completed', conclusion: 'success' }), artifact)).toBe(
      'succeeded',
    );
  });

  it('maps findings + a failure conclusion to "failed" (deterministic gate blocked the PR)', () => {
    const artifact = { findings_count: 3, cost_usd: 0.02, agent: 'Reviewer' };
    expect(mapRunStatus(run({ status: 'completed', conclusion: 'failure' }), artifact)).toBe('failed');
  });
});
