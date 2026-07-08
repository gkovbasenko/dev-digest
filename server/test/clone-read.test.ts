import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readCloneFile, MAX_READ_FILE_SIZE } from '../src/modules/_shared/clone-read.js';

/**
 * S4 — readCloneFile must refuse to read a file over MAX_READ_FILE_SIZE
 * (a size-bounded backstop, since walkClone's 400KB discovery-time filter is
 * never re-applied to a client-submitted or previously-stored path fed
 * straight into readCloneFile by attach-validate/preview/run-time
 * injection).
 */
describe('readCloneFile — size guard (S4)', () => {
  it('reads a normal small file through the contained boundary', async () => {
    const clonePath = await mkdtemp(join(tmpdir(), 'dd-clone-read-'));
    await mkdir(join(clonePath, 'specs'), { recursive: true });
    await writeFile(join(clonePath, 'specs', 'a.md'), '# hello', 'utf8');

    expect(await readCloneFile(clonePath, 'specs/a.md')).toBe('# hello');
  });

  it('refuses a file at exactly MAX_READ_FILE_SIZE + 1 byte', async () => {
    const clonePath = await mkdtemp(join(tmpdir(), 'dd-clone-read-'));
    await writeFile(join(clonePath, 'huge.md'), 'x'.repeat(MAX_READ_FILE_SIZE + 1), 'utf8');

    expect(await readCloneFile(clonePath, 'huge.md')).toBeNull();
  });

  it('reads a file exactly at MAX_READ_FILE_SIZE (boundary is inclusive)', async () => {
    const clonePath = await mkdtemp(join(tmpdir(), 'dd-clone-read-'));
    const content = 'x'.repeat(MAX_READ_FILE_SIZE);
    await writeFile(join(clonePath, 'boundary.md'), content, 'utf8');

    expect(await readCloneFile(clonePath, 'boundary.md')).toBe(content);
  });

  it('returns null for a missing file (unrelated to the size guard)', async () => {
    const clonePath = await mkdtemp(join(tmpdir(), 'dd-clone-read-'));
    expect(await readCloneFile(clonePath, 'does/not/exist.md')).toBeNull();
  });
});
