import { describe, it, expect } from 'vitest';
import type { Finding, PrFile } from '@devdigest/shared';
import { classifyFile } from '../src/modules/reviews/smart-diff/classify.js';
import { composeSmartDiff } from '../src/modules/reviews/smart-diff/compose.js';
import {
  BOILERPLATE_DIRS,
  BOILERPLATE_LOCKFILES,
  SPLIT_TOO_BIG_LINES,
} from '../src/modules/reviews/smart-diff/constants.js';

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

  // Cover every generated/vendored dir name, so dropping one from the constant
  // (a narrowing regression) is caught rather than silently accepted.
  it.each([...BOILERPLATE_DIRS])('classifies a file under %s/ as boilerplate', (dir) => {
    expect(classifyFile(`${dir}/x.js`)).toBe('boilerplate');
  });

  // Same narrowing-regression guard for the named lockfile list.
  it.each([...BOILERPLATE_LOCKFILES])('classifies the lockfile %s as boilerplate', (lock) => {
    expect(classifyFile(lock)).toBe('boilerplate');
  });

  it('classifies package.json as wiring', () => {
    expect(classifyFile('package.json')).toBe('wiring');
  });

  it('classifies an index barrel as wiring', () => {
    expect(classifyFile('src/modules/reviews/index.ts')).toBe('wiring');
  });

  it('classifies the second entrypoint/index list entries (main.ts, index.js) as wiring', () => {
    expect(classifyFile('src/main.ts')).toBe('wiring');
    expect(classifyFile('src/foo/index.js')).toBe('wiring');
  });

  it('classifies a snapshot file as boilerplate', () => {
    expect(classifyFile('src/__snapshots__/foo.test.ts.snap')).toBe('boilerplate');
  });

  it('classifies a bare *.lock file as boilerplate', () => {
    expect(classifyFile('Gemfile.lock')).toBe('boilerplate');
  });

  it('classifies a minified file as boilerplate', () => {
    expect(classifyFile('public/app.min.js')).toBe('boilerplate');
  });

  it('classifies a sourcemap (outside a build dir) as boilerplate', () => {
    expect(classifyFile('src/app.js.map')).toBe('boilerplate');
  });

  it('classifies a prefixed tsconfig as wiring', () => {
    expect(classifyFile('tsconfig.build.json')).toBe('wiring');
  });

  it('classifies a .github workflow as wiring', () => {
    expect(classifyFile('.github/workflows/ci.yml')).toBe('wiring');
  });

  it('classifies an app entrypoint basename as wiring', () => {
    expect(classifyFile('src/server.ts')).toBe('wiring');
  });

  it('classifies a dotenv variant as wiring', () => {
    expect(classifyFile('.env.production')).toBe('wiring');
  });

  it('prioritizes boilerplate over wiring when a path matches both', () => {
    // dist/ (boilerplate dir) beats config.json (wiring) — classifyFile runs
    // the boilerplate check first; a swap of that order would break this.
    expect(classifyFile('dist/config.json')).toBe('boilerplate');
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

  it('includes only the non-empty role groups when one of several roles has no files', () => {
    // core + wiring present, no boilerplate at all → exactly two groups, in order.
    const files = [file('src/foo.ts'), file('vite.config.ts')];
    const result = composeSmartDiff(files, []);
    expect(result.groups.map((g) => g.role)).toEqual(['core', 'wiring']);
  });

  it('returns empty groups and a zero split_suggestion for no files', () => {
    const result = composeSmartDiff([], []);
    expect(result).toEqual({
      groups: [],
      split_suggestion: { too_big: false, total_lines: 0, proposed_splits: [] },
    });
  });

  it('drops findings whose file matches no PR file', () => {
    const files = [file('src/foo.ts')];
    const findings = [finding('src/foo.ts', 3), finding('ghost.ts', 9)];
    const result = composeSmartDiff(files, findings);
    const foo = result.groups
      .find((g) => g.role === 'core')!
      .files.find((f) => f.path === 'src/foo.ts')!;
    expect(foo.findings).toEqual([{ start_line: 3, end_line: 3, severity: 'WARNING' }]);
    // ghost.ts is not a PR file, so it never appears anywhere in the output.
    const allPaths = result.groups.flatMap((g) => g.files.map((f) => f.path));
    expect(allPaths).not.toContain('ghost.ts');
  });

  it('sets findings (line range + severity) from findings matching the file path, per file', () => {
    const files = [file('src/foo.ts'), file('src/bar.ts')];
    const findings = [finding('src/foo.ts', 10), finding('src/foo.ts', 20), finding('src/bar.ts', 5)];
    const result = composeSmartDiff(files, findings);
    const core = result.groups.find((g) => g.role === 'core')!;
    const foo = core.files.find((f) => f.path === 'src/foo.ts')!;
    const bar = core.files.find((f) => f.path === 'src/bar.ts')!;
    expect(foo.findings).toEqual([
      { start_line: 10, end_line: 10, severity: 'WARNING' },
      { start_line: 20, end_line: 20, severity: 'WARNING' },
    ]);
    expect(bar.findings).toEqual([{ start_line: 5, end_line: 5, severity: 'WARNING' }]);
    expect(foo.pseudocode_summary).toBeNull();
  });

  it('leaves findings empty for every file when there are no findings', () => {
    const files = [file('src/foo.ts'), file('vite.config.ts')];
    const result = composeSmartDiff(files, []);
    for (const group of result.groups) {
      for (const f of group.files) {
        expect(f.findings).toEqual([]);
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
