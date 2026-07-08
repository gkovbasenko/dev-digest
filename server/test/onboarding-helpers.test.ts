import { describe, it, expect } from 'vitest';
import { sep, join } from 'node:path';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {
  buildOnboardingPrompt,
  RawOnboarding,
  resolveClonePath,
  resolveRealClonePath,
  readCloneFile,
} from '../src/modules/onboarding/helpers.js';
import { ONBOARDING_SECTION_KINDS } from '../src/modules/onboarding/constants.js';

function validSection(kind: string) {
  return {
    kind,
    title: `Title for ${kind}`,
    body: `Body for ${kind}`,
    diagram: null,
    links: [],
  };
}

const VALID_SECTIONS = ONBOARDING_SECTION_KINDS.map((k) => validSection(k));

describe('RawOnboarding — schema + AC-3 strict section enforcement', () => {
  it('accepts exactly the five required section kinds', () => {
    const parsed = RawOnboarding.safeParse({ sections: VALID_SECTIONS });
    expect(parsed.success).toBe(true);
  });

  it('rejects a payload missing a section', () => {
    const parsed = RawOnboarding.safeParse({ sections: VALID_SECTIONS.slice(0, 4) });
    expect(parsed.success).toBe(false);
  });

  it('rejects a payload with an extra/unknown section kind', () => {
    const parsed = RawOnboarding.safeParse({
      sections: [...VALID_SECTIONS, validSection('routes_and_apis')],
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a payload with a duplicated kind standing in for a missing one', () => {
    const sections = VALID_SECTIONS.slice(0, 4).concat(validSection('architecture'));
    const parsed = RawOnboarding.safeParse({ sections });
    expect(parsed.success).toBe(false);
  });

  it('rejects a section whose kind is not one of the five (out-of-enum)', () => {
    const parsed = RawOnboarding.safeParse({
      sections: [...VALID_SECTIONS.slice(0, 4), validSection('not_a_real_kind')],
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts a null diagram and defaults links to an empty array requirement (schema requires the field)', () => {
    const parsed = RawOnboarding.safeParse({ sections: VALID_SECTIONS });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      for (const s of parsed.data.sections) {
        expect(s.diagram).toBeNull();
        expect(s.links).toEqual([]);
      }
    }
  });
});

describe('buildOnboardingPrompt', () => {
  it('wraps ranked files, critical paths, and every key-file excerpt with wrapUntrusted', async () => {
    const messages = await buildOnboardingPrompt({
      rankedFiles: ['src/a.ts', 'src/b.ts'],
      criticalPaths: [['src/a.ts', 'src/b.ts']],
      keyFiles: [{ path: 'README.md', content: '# Hello' }],
      language: 'English',
    });

    expect(messages[0]!.role).toBe('system');
    expect(messages[1]!.role).toBe('user');
    const user = messages[1]!.content;

    expect(user).toContain('<untrusted source="ranked-files">');
    expect(user).toContain('src/a.ts');
    expect(user).toContain('<untrusted source="critical-paths">');
    expect(user).toContain('src/a.ts -> src/b.ts');
    expect(user).toContain('<untrusted source="README.md">');
    expect(user).toContain('# Hello');
    expect(user).toContain('</untrusted>');
  });

  it('renders the system prompt with the five section kinds and the SECURITY clause', async () => {
    const messages = await buildOnboardingPrompt({
      rankedFiles: [],
      criticalPaths: [],
      keyFiles: [],
    });
    const system = messages[0]!.content;
    for (const kind of ONBOARDING_SECTION_KINDS) {
      expect(system).toContain(kind);
    }
    expect(system).toMatch(/SECURITY/);
    expect(system).toContain('English'); // default language substituted, not left as {{language}}
  });

  it('substitutes an explicit language into the system prompt (renderTemplate leaves unknown placeholders literal)', async () => {
    const messages = await buildOnboardingPrompt({
      rankedFiles: [],
      criticalPaths: [],
      keyFiles: [],
      language: 'French',
    });
    expect(messages[0]!.content).toContain('French');
    expect(messages[0]!.content).not.toContain('{{language}}');
  });
});

/**
 * Negative-control coverage for the containment reader re-exported from
 * `_shared/clone-read.ts` (promoted from `conventions/helpers.ts` +
 * `conventions/service.ts` — see server INSIGHTS 2026-07-02). Onboarding
 * reads `KEY_FILE_CANDIDATES` unconditionally (no LLM cooperation needed),
 * so both a syntactic traversal AND a symlink escape must be proven closed
 * for THIS module's own call path, not just conventions'.
 */
describe('onboarding clone-read containment (traversal + symlink negative controls)', () => {
  it('rejects a syntactic traversal path before any filesystem read', () => {
    const CLONE = '/tmp/dd-onboarding-clones/acme-repo';
    expect(resolveClonePath(CLONE, '../../../../etc/passwd')).toBeNull();
  });

  it('resolveRealClonePath rejects a symlink inside the clone that points outside it', async () => {
    const clonePath = await mkdtemp(join(tmpdir(), 'dd-onboarding-realpath-'));
    const outsideDir = await mkdtemp(join(tmpdir(), 'dd-onboarding-outside-'));
    try {
      const secretPath = join(outsideDir, 'secret.txt');
      await writeFile(secretPath, 'SECRET_TOKEN_ONBOARDING', 'utf8');
      // A repo can commit a symlink (git mode 120000); checkout materializes
      // it as a real filesystem symlink.
      await symlink(secretPath, join(clonePath, 'README.md'));

      const real = await resolveRealClonePath(clonePath, 'README.md');
      expect(real).toBeNull();
    } finally {
      await rm(clonePath, { recursive: true, force: true });
      await rm(outsideDir, { recursive: true, force: true });
    }
  });

  it('readCloneFile returns null (not the secret content) for a traversal path', async () => {
    const clonePath = await mkdtemp(join(tmpdir(), 'dd-onboarding-read-'));
    const outsideDir = await mkdtemp(join(tmpdir(), 'dd-onboarding-outside-'));
    try {
      await writeFile(join(outsideDir, 'secret.txt'), 'SECRET_TOKEN_ONBOARDING', 'utf8');
      expect(await readCloneFile(clonePath, '../../../../etc/passwd')).toBeNull();
    } finally {
      await rm(clonePath, { recursive: true, force: true });
      await rm(outsideDir, { recursive: true, force: true });
    }
  });

  it('readCloneFile returns null (not the secret content) for a symlink escape', async () => {
    const clonePath = await mkdtemp(join(tmpdir(), 'dd-onboarding-read-'));
    const outsideDir = await mkdtemp(join(tmpdir(), 'dd-onboarding-outside-'));
    try {
      const secretPath = join(outsideDir, 'secret.txt');
      await writeFile(secretPath, 'SECRET_TOKEN_ONBOARDING', 'utf8');
      await symlink(secretPath, join(clonePath, 'package.json'));

      const content = await readCloneFile(clonePath, 'package.json');
      expect(content).toBeNull();
    } finally {
      await rm(clonePath, { recursive: true, force: true });
      await rm(outsideDir, { recursive: true, force: true });
    }
  });

  it('readCloneFile DOES read a legitimate in-clone key file (positive control)', async () => {
    const clonePath = await mkdtemp(join(tmpdir(), 'dd-onboarding-read-'));
    try {
      await writeFile(join(clonePath, 'README.md'), '# Real repo', 'utf8');
      expect(await readCloneFile(clonePath, 'README.md')).toBe('# Real repo');
    } finally {
      await rm(clonePath, { recursive: true, force: true });
    }
  });

  it('sibling-directory string-prefix trick is rejected (shares the clone dir as a prefix only)', () => {
    const CLONE = '/tmp/dd-onboarding-clones/acme-repo';
    expect(resolveClonePath(CLONE, `..${sep}acme-repo-evil${sep}secret.env`)).toBeNull();
  });
});
