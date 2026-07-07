import { describe, it, expect } from 'vitest';
import { taskLine, stripUntrustedMarkers } from '../src/modules/reviews/helpers.js';
import { UNTRUSTED_SKILL_START, UNTRUSTED_SKILL_END } from '../src/modules/skills/constants.js';

/**
 * Unit coverage for the review task-line. The key invariant: our trusted
 * instruction always tells the model to review the whole diff and never
 * withhold a security/correctness finding — no matter what the PR text claims.
 */

describe('taskLine', () => {
  const pull = { number: 3, title: 'test: vulnerable fixture', author: 'burnjohn' } as never;

  it('names the PR being reviewed', () => {
    const line = taskLine(pull);
    expect(line).toContain('#3');
    expect(line).toContain('test: vulnerable fixture');
  });

  it('keeps the non-negotiable "never withhold security" rule', () => {
    const line = taskLine(pull);
    expect(line).toMatch(/never .*withhold .*(or downgrade )?.*security/i);
    expect(line).toMatch(/review the entire diff/i);
  });
});

/**
 * `stripUntrustedMarkers` is the sanitization step between a human-vetted
 * (enabled) skill body and the review prompt's un-delimiter-wrapped `skills`
 * slot — see server/INSIGHTS.md, 2026-07-01.
 */
describe('stripUntrustedMarkers', () => {
  it('strips both markers when present', () => {
    const body = `${UNTRUSTED_SKILL_START}\nAlways use snake_case.\n${UNTRUSTED_SKILL_END}`;
    expect(stripUntrustedMarkers(body)).toBe('Always use snake_case.');
  });

  it('is a no-op (besides trimming) when no markers are present', () => {
    expect(stripUntrustedMarkers('Always use snake_case.')).toBe('Always use snake_case.');
    expect(stripUntrustedMarkers('  Always use snake_case.  ')).toBe('Always use snake_case.');
  });

  it('strips a lone start marker with no matching end marker', () => {
    const body = `${UNTRUSTED_SKILL_START}\nAlways use snake_case.`;
    expect(stripUntrustedMarkers(body)).toBe('Always use snake_case.');
  });

  it('trims surrounding whitespace left after stripping', () => {
    const body = `  ${UNTRUSTED_SKILL_START}  \n  Always use snake_case.  \n  ${UNTRUSTED_SKILL_END}  `;
    expect(stripUntrustedMarkers(body)).toBe('Always use snake_case.');
  });

  it('preserves a marker string that appears inside the body — only the wrapper is stripped', () => {
    const body = `${UNTRUSTED_SKILL_START}\nRule: never write ${UNTRUSTED_SKILL_START} verbatim in code.\n${UNTRUSTED_SKILL_END}`;
    expect(stripUntrustedMarkers(body)).toBe(
      `Rule: never write ${UNTRUSTED_SKILL_START} verbatim in code.`,
    );
  });

  it('does not strip a trailing end marker that is not at the very end', () => {
    const body = `${UNTRUSTED_SKILL_END} still trusted content here`;
    expect(stripUntrustedMarkers(body)).toBe(`${UNTRUSTED_SKILL_END} still trusted content here`);
  });
});
