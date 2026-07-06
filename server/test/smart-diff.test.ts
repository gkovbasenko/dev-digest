import { describe, it, expect } from 'vitest';
import type { Finding, PrFile } from '@devdigest/shared';
import { classifyFile } from '../src/modules/reviews/smart-diff/classify.js';
import { composeSmartDiff } from '../src/modules/reviews/smart-diff/compose.js';
import { SPLIT_TOO_BIG_LINES } from '../src/modules/reviews/smart-diff/constants.js';

/**
 * S2/S3 unit coverage — pure classification + composition, no DB/network/LLM.
 */

describe('classifyFile', () => {
  it('classifies a business-logic file as core', () => {
    expect(classifyFile('src/adapters/ratelimit.ts')).toBe('core');
  });

  it('classifies a config file as wiring', () => {
    expect(classifyFile('src/config.ts')).toBe('wiring');
  });

  it('classifies package-lock.json as boilerplate', () => {
    expect(classifyFile('package-lock.json')).toBe('boilerplate');
  });

  it('classifies a build-output file as boilerplate', () => {
    expect(classifyFile('dist/x.js')).toBe('boilerplate');
  });

  it('classifies package.json as wiring', () => {
    expect(classifyFile('package.json')).toBe('wiring');
  });

  it('classifies an index barrel as wiring', () => {
    expect(classifyFile('src/modules/reviews/index.ts')).toBe('wiring');
  });

  it('classifies a snapshot file as boilerplate', () => {
    expect(classifyFile('src/__snapshots__/foo.test.ts.snap')).toBe('boilerplate');
  });
});

function file(path: string, additions = 1, deletions = 1): PrFile {
  return { path, additions, deletions, patch: null };
}

function finding(file_: string, start_line: number): Finding {
  return {
    id: `finding-${file_}-${start_line}`,
    severity: 'WARNING',
    category: 'bug',
    title: 'test finding',
    file: file_,
    start_line,
    end_line: start_line,
    rationale: 'because',
    suggestion: null,
    confidence: 0.9,
    kind: 'finding',
    trifecta_components: null,
    evidence: null,
  };
}

describe('composeSmartDiff', () => {
  it('groups files core → wiring → boilerplate, omitting empty groups', () => {
    const files = [file('package-lock.json'), file('src/foo.ts'), file('vite.config.ts')];
    const result = composeSmartDiff(files, []);
    expect(result.groups.map((g) => g.role)).toEqual(['core', 'wiring', 'boilerplate']);
    expect(result.groups.find((g) => g.role === 'core')?.files.map((f) => f.path)).toEqual([
      'src/foo.ts',
    ]);
    expect(result.groups.find((g) => g.role === 'wiring')?.files.map((f) => f.path)).toEqual([
      'vite.config.ts',
    ]);
    expect(result.groups.find((g) => g.role === 'boilerplate')?.files.map((f) => f.path)).toEqual([
      'package-lock.json',
    ]);
  });

  it('omits a group entirely when it has no files', () => {
    const files = [file('src/foo.ts')];
    const result = composeSmartDiff(files, []);
    expect(result.groups).toEqual([{ role: 'core', files: expect.any(Array) }]);
  });

  it('sets finding_lines from findings matching the file path, per file', () => {
    const files = [file('src/foo.ts'), file('src/bar.ts')];
    const findings = [finding('src/foo.ts', 10), finding('src/foo.ts', 20), finding('src/bar.ts', 5)];
    const result = composeSmartDiff(files, findings);
    const core = result.groups.find((g) => g.role === 'core')!;
    const foo = core.files.find((f) => f.path === 'src/foo.ts')!;
    const bar = core.files.find((f) => f.path === 'src/bar.ts')!;
    expect(foo.finding_lines).toEqual([10, 20]);
    expect(bar.finding_lines).toEqual([5]);
    expect(foo.pseudocode_summary).toBeNull();
  });

  it('leaves finding_lines empty for every file when there are no findings', () => {
    const files = [file('src/foo.ts'), file('vite.config.ts')];
    const result = composeSmartDiff(files, []);
    for (const group of result.groups) {
      for (const f of group.files) {
        expect(f.finding_lines).toEqual([]);
      }
    }
  });

  it('marks too_big=false and proposed_splits=[] under the threshold', () => {
    const files = [file('a/x.ts', 10, 10), file('b/y.ts', 10, 10)];
    const result = composeSmartDiff(files, []);
    expect(result.split_suggestion.total_lines).toBe(40);
    expect(result.split_suggestion.too_big).toBe(false);
    expect(result.split_suggestion.proposed_splits).toEqual([]);
  });

  it('marks too_big=true and groups proposed_splits by top-level directory over the threshold', () => {
    const big = SPLIT_TOO_BIG_LINES + 100;
    const files = [
      file('a/x.ts', big / 2, 0),
      file('a/y.ts', big / 2, 0),
      file('b/z.ts', 10, 0),
    ];
    const result = composeSmartDiff(files, []);
    expect(result.split_suggestion.too_big).toBe(true);
    expect(result.split_suggestion.proposed_splits).toEqual(
      expect.arrayContaining([
        { name: 'a', files: ['a/x.ts', 'a/y.ts'] },
        { name: 'b', files: ['b/z.ts'] },
      ]),
    );
  });

  it('does not propose a split when too_big but all files share one top-level directory', () => {
    const big = SPLIT_TOO_BIG_LINES + 100;
    const files = [file('a/x.ts', big / 2, 0), file('a/y.ts', big / 2, 0)];
    const result = composeSmartDiff(files, []);
    expect(result.split_suggestion.too_big).toBe(true);
    expect(result.split_suggestion.proposed_splits).toEqual([]);
  });
});
