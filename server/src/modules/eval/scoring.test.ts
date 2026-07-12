import { describe, it, expect } from 'vitest';
import type { Finding } from '@devdigest/shared';
import { aggregateRun, scoreCase, type CaseScore } from './scoring.js';
import type { ExpectedOutput } from './helpers.js';

/** Minimal Finding fixture — only file/start_line/end_line matter to scoring. */
function finding(over: Partial<Finding> = {}): Finding {
  return {
    id: over.id ?? 'f1',
    severity: 'CRITICAL',
    category: 'security',
    title: 'x',
    file: 'src/config.ts',
    start_line: 10,
    end_line: 10,
    rationale: 'r',
    confidence: 0.9,
    ...over,
  };
}

const EMPTY: ExpectedOutput = { must_find: [], must_not_flag: [] };

describe('scoreCase (AC-9..AC-14)', () => {
  it('matches a must_find region when file matches AND ranges intersect', () => {
    const expected: ExpectedOutput = {
      must_find: [
        { file: 'src/config.ts', start_line: 10, end_line: 12, severity: 'CRITICAL', category: 'security', title: 't' },
      ],
      must_not_flag: [],
    };
    const s = scoreCase({
      caseId: 'c1',
      name: 'case 1',
      expected,
      actual: [finding({ start_line: 11, end_line: 11 })],
      failed: false,
      costUsd: 0.001,
      durationMs: 5,
    });
    expect(s.result.pass).toBe(true);
    expect(s.result.expected).toBe(1);
    expect(s.result.got).toBe(1);
    expect(s.result.recall).toBe(1);
    expect(s.result.precision).toBe(1);
    expect(s.matchedMustFind).toBe(1);
  });

  it('does NOT match when the file differs', () => {
    const expected: ExpectedOutput = {
      must_find: [
        { file: 'src/other.ts', start_line: 10, end_line: 10, severity: 'CRITICAL', category: 'security', title: 't' },
      ],
      must_not_flag: [],
    };
    const s = scoreCase({
      caseId: 'c2',
      name: 'case 2',
      expected,
      actual: [finding({ file: 'src/config.ts', start_line: 10, end_line: 10 })],
      failed: false,
      costUsd: null,
      durationMs: 5,
    });
    expect(s.matchedMustFind).toBe(0);
    expect(s.result.pass).toBe(false);
    expect(s.result.recall).toBe(0);
  });

  it('does NOT match when ranges do not intersect', () => {
    const expected: ExpectedOutput = {
      must_find: [
        { file: 'src/config.ts', start_line: 10, end_line: 12, severity: 'CRITICAL', category: 'security', title: 't' },
      ],
      must_not_flag: [],
    };
    const s = scoreCase({
      caseId: 'c3',
      name: 'case 3',
      expected,
      actual: [finding({ start_line: 20, end_line: 25 })],
      failed: false,
      costUsd: null,
      durationMs: 5,
    });
    expect(s.matchedMustFind).toBe(0);
    expect(s.result.pass).toBe(false);
  });

  it('matches at an inclusive boundary (shared endpoint counts as intersecting)', () => {
    const expected: ExpectedOutput = {
      must_find: [
        { file: 'src/config.ts', start_line: 10, end_line: 20, severity: 'CRITICAL', category: 'security', title: 't' },
      ],
      must_not_flag: [],
    };
    const s = scoreCase({
      caseId: 'c4',
      name: 'case 4',
      expected,
      actual: [finding({ start_line: 20, end_line: 25 })], // touches exactly at line 20
      failed: false,
      costUsd: null,
      durationMs: 5,
    });
    expect(s.matchedMustFind).toBe(1);
    expect(s.result.pass).toBe(true);
  });

  it('a must_not_flag violation fails the case even when every must_find is matched', () => {
    const expected: ExpectedOutput = {
      must_find: [
        { file: 'src/config.ts', start_line: 10, end_line: 10, severity: 'CRITICAL', category: 'security', title: 't' },
      ],
      must_not_flag: [{ file: 'src/config.ts', start_line: 30, end_line: 30 }],
    };
    const s = scoreCase({
      caseId: 'c5',
      name: 'case 5',
      expected,
      actual: [finding({ start_line: 10, end_line: 10 }), finding({ id: 'f2', start_line: 30, end_line: 30 })],
      failed: false,
      costUsd: null,
      durationMs: 5,
    });
    expect(s.matchedMustFind).toBe(1);
    expect(s.result.pass).toBe(false);
  });

  it('an empty expectation with zero actual findings passes with null recall/precision', () => {
    const s = scoreCase({
      caseId: 'c6',
      name: 'case 6',
      expected: EMPTY,
      actual: [],
      failed: false,
      costUsd: null,
      durationMs: 5,
    });
    expect(s.result.pass).toBe(true);
    expect(s.result.recall).toBeNull();
    expect(s.result.precision).toBeNull();
    expect(s.result.expected).toBe(0);
    expect(s.result.got).toBe(0);
  });

  it('failed:true forces pass:false even for a trivially-satisfied empty expectation', () => {
    const s = scoreCase({
      caseId: 'c7',
      name: 'case 7',
      expected: EMPTY,
      actual: [],
      failed: true,
      failureReason: 'malformed input_diff: no files parsed',
      costUsd: null,
      durationMs: 5,
    });
    expect(s.result.pass).toBe(false);
    expect(s.result.actual).toEqual({ error: 'malformed input_diff: no files parsed' });
  });

  it('partial recall: 1 of 2 must_find regions matched', () => {
    const expected: ExpectedOutput = {
      must_find: [
        { file: 'src/config.ts', start_line: 10, end_line: 10, severity: 'CRITICAL', category: 'security', title: 'a' },
        { file: 'src/config.ts', start_line: 40, end_line: 40, severity: 'WARNING', category: 'bug', title: 'b' },
      ],
      must_not_flag: [],
    };
    const s = scoreCase({
      caseId: 'c8',
      name: 'case 8',
      expected,
      actual: [finding({ start_line: 10, end_line: 10 })],
      failed: false,
      costUsd: null,
      durationMs: 5,
    });
    expect(s.matchedMustFind).toBe(1);
    expect(s.result.recall).toBe(0.5);
    expect(s.result.pass).toBe(false); // not ALL must_find matched
  });

  it('matches when the expected region has start_line > end_line (swapped bounds are normalized)', () => {
    const expected: ExpectedOutput = {
      must_find: [
        // Deliberately inverted: regionsIntersect min/max-normalizes both sides.
        { file: 'src/config.ts', start_line: 12, end_line: 10, severity: 'CRITICAL', category: 'security', title: 't' },
      ],
      must_not_flag: [],
    };
    const s = scoreCase({
      caseId: 'c-swap',
      name: 'swapped bounds',
      expected,
      actual: [finding({ start_line: 11, end_line: 11 })],
      failed: false,
      costUsd: null,
      durationMs: 5,
    });
    expect(s.matchedMustFind).toBe(1);
    expect(s.result.pass).toBe(true);
  });

  it('failed:true with NO failureReason falls back to the default "case failed" error', () => {
    const s = scoreCase({
      caseId: 'c-nofail',
      name: 'failed without reason',
      expected: EMPTY,
      actual: [],
      failed: true,
      costUsd: null,
      durationMs: 5,
    });
    expect(s.result.pass).toBe(false);
    expect(s.result.actual).toEqual({ error: 'case failed' });
  });

  it('precision: an extra unexpected finding counts as a false positive', () => {
    const expected: ExpectedOutput = {
      must_find: [
        { file: 'src/config.ts', start_line: 10, end_line: 10, severity: 'CRITICAL', category: 'security', title: 'a' },
      ],
      must_not_flag: [],
    };
    const s = scoreCase({
      caseId: 'c9',
      name: 'case 9',
      expected,
      actual: [finding({ start_line: 10, end_line: 10 }), finding({ id: 'f2', start_line: 99, end_line: 99 })],
      failed: false,
      costUsd: null,
      durationMs: 5,
    });
    expect(s.truePositive).toBe(1);
    expect(s.falsePositive).toBe(1);
    expect(s.result.precision).toBe(0.5);
    // extra finding is not a must_not_flag region, so it doesn't fail the case
    // by itself — must_find coverage is what pass hinges on here.
    expect(s.matchedMustFind).toBe(1);
    expect(s.result.pass).toBe(true);
  });
});

describe('aggregateRun (AC-8, D4)', () => {
  function withScore(over: Partial<CaseScore>): CaseScore {
    return {
      result: {
        case_id: 'c',
        name: 'c',
        pass: true,
        expected: 0,
        got: 0,
        recall: null,
        precision: null,
        cost_usd: null,
        duration_ms: 1,
        actual: [],
      },
      mustFindCount: 0,
      matchedMustFind: 0,
      truePositive: 0,
      falsePositive: 0,
      ...over,
    };
  }

  it('an empty score set yields null metrics and zero traces (no cases scored)', () => {
    const agg = aggregateRun([], { kept: 0, dropped: 0 });
    expect(agg.recall).toBeNull();
    expect(agg.precision).toBeNull();
    expect(agg.citation_accuracy).toBeNull();
    expect(agg.traces_passed).toBe(0);
    expect(agg.traces_total).toBe(0);
  });

  it('recall is null when no case in the set has a must_find region (D4)', () => {
    const scores = [withScore({}), withScore({})];
    const agg = aggregateRun(scores, { kept: 0, dropped: 0 });
    expect(agg.recall).toBeNull();
  });

  it('recall = Σmatched/Σmust_find over cases that DO have a must_find region', () => {
    const scores = [
      withScore({ mustFindCount: 2, matchedMustFind: 1 }),
      withScore({}), // no must_find — excluded from the recall denominator
      withScore({ mustFindCount: 1, matchedMustFind: 1 }),
    ];
    const agg = aggregateRun(scores, { kept: 0, dropped: 0 });
    // (1 + 1) / (2 + 1) = 2/3
    expect(agg.recall).toBeCloseTo(2 / 3);
  });

  it('precision is null when TP+FP is 0 across the whole run', () => {
    const scores = [withScore({}), withScore({})];
    const agg = aggregateRun(scores, { kept: 0, dropped: 0 });
    expect(agg.precision).toBeNull();
  });

  it('precision = ΣTP/(ΣTP+ΣFP) across all cases', () => {
    const scores = [withScore({ truePositive: 2, falsePositive: 1 }), withScore({ truePositive: 1, falsePositive: 0 })];
    const agg = aggregateRun(scores, { kept: 0, dropped: 0 });
    // 3 / 4
    expect(agg.precision).toBeCloseTo(0.75);
  });

  it('citation_accuracy = Σkept/Σ(kept+dropped); null when the whole run never attempted grounding (AC-10)', () => {
    expect(aggregateRun([withScore({})], { kept: 0, dropped: 0 }).citation_accuracy).toBeNull();
    expect(aggregateRun([withScore({})], { kept: 3, dropped: 1 }).citation_accuracy).toBeCloseTo(0.75);
  });

  it('traces_passed / traces_total reflect the per-case pass flags', () => {
    const scores = [
      withScore({ result: { ...withScore({}).result, pass: true } }),
      withScore({ result: { ...withScore({}).result, pass: false } }),
      withScore({ result: { ...withScore({}).result, pass: true } }),
    ];
    const agg = aggregateRun(scores, { kept: 0, dropped: 0 });
    expect(agg.traces_passed).toBe(2);
    expect(agg.traces_total).toBe(3);
  });
});
