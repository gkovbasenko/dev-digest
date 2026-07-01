import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isBlockedIPv4, isBlockedIPv6, fetchSkillUrl } from '../src/modules/skills/fetch-skill.js';

/**
 * Unit tests for the SSRF guard in fetchSkillUrl. The key invariant: no user-supplied
 * URL should be able to reach private infrastructure (loopback, private ranges, cloud
 * metadata). Uses mocked dns.lookup and global fetch — no real network calls.
 */

// ── isBlockedIPv4 ──────────────────────────────────────────────────────────────

describe('isBlockedIPv4', () => {
  it('blocks loopback (127.x.x.x)', () => {
    expect(isBlockedIPv4('127.0.0.1')).toBe(true);
    expect(isBlockedIPv4('127.255.255.255')).toBe(true);
  });

  it('blocks class-A private (10.x.x.x)', () => {
    expect(isBlockedIPv4('10.0.0.1')).toBe(true);
    expect(isBlockedIPv4('10.255.255.255')).toBe(true);
  });

  it('blocks class-B private (172.16–31.x.x)', () => {
    expect(isBlockedIPv4('172.16.0.1')).toBe(true);
    expect(isBlockedIPv4('172.31.255.255')).toBe(true);
    expect(isBlockedIPv4('172.15.255.255')).toBe(false);
    expect(isBlockedIPv4('172.32.0.0')).toBe(false);
  });

  it('blocks class-C private (192.168.x.x)', () => {
    expect(isBlockedIPv4('192.168.0.1')).toBe(true);
    expect(isBlockedIPv4('192.168.255.255')).toBe(true);
  });

  it('blocks link-local / cloud metadata (169.254.x.x)', () => {
    expect(isBlockedIPv4('169.254.0.1')).toBe(true);
    expect(isBlockedIPv4('169.254.169.254')).toBe(true); // AWS metadata
  });

  it('allows public IPs', () => {
    expect(isBlockedIPv4('1.1.1.1')).toBe(false);
    expect(isBlockedIPv4('8.8.8.8')).toBe(false);
    expect(isBlockedIPv4('93.184.216.34')).toBe(false);
  });
});

// ── isBlockedIPv6 ──────────────────────────────────────────────────────────────

describe('isBlockedIPv6', () => {
  it('blocks loopback (::1)', () => {
    expect(isBlockedIPv6('::1')).toBe(true);
  });

  it('blocks unique-local (fc00::/7)', () => {
    expect(isBlockedIPv6('fc00::1')).toBe(true);
    expect(isBlockedIPv6('fd12:3456::1')).toBe(true);
  });

  it('blocks the full link-local range (fe80::/10 = fe80-febf), not just the literal fe80 prefix', () => {
    // The 10-bit prefix doesn't land on a hex-digit boundary: the range spans
    // first-hextet values fe80-febf, so fe90/fea0/febf are link-local too,
    // even though they don't start with the literal string "fe80".
    expect(isBlockedIPv6('fe80::1')).toBe(true);
    expect(isBlockedIPv6('fe81::1')).toBe(true);
    expect(isBlockedIPv6('fe90::1')).toBe(true);
    expect(isBlockedIPv6('fea0::1')).toBe(true);
    expect(isBlockedIPv6('febf::1')).toBe(true);
  });

  it('does not block addresses just outside the fe80::/10 link-local range', () => {
    expect(isBlockedIPv6('fec0::1')).toBe(false);
    expect(isBlockedIPv6('fe7f::1')).toBe(false);
  });

  it('allows public IPv6', () => {
    expect(isBlockedIPv6('2606:4700:4700::1111')).toBe(false);
  });

  it('blocks IPv4-mapped IPv6 addresses that resolve to a private range', () => {
    expect(isBlockedIPv6('::ffff:10.0.0.1')).toBe(true);
    expect(isBlockedIPv6('::ffff:127.0.0.1')).toBe(true);
    expect(isBlockedIPv6('::ffff:169.254.169.254')).toBe(true);
  });

  it('allows IPv4-mapped IPv6 addresses that resolve to a public IP', () => {
    expect(isBlockedIPv6('::ffff:8.8.8.8')).toBe(false);
  });
});

// ── fetchSkillUrl ──────────────────────────────────────────────────────────────

vi.mock('node:dns/promises', () => ({
  default: { lookup: vi.fn() },
}));

const { mockAgentCtor } = vi.hoisted(() => ({ mockAgentCtor: vi.fn() }));
vi.mock('undici', () => ({
  Agent: mockAgentCtor,
}));

import dns from 'node:dns/promises';
const mockLookup = dns.lookup as ReturnType<typeof vi.fn>;

function mockFetch(text: string, status = 200) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  let pos = 0;
  const stream = new ReadableStream({
    pull(controller) {
      if (pos < bytes.length) {
        controller.enqueue(bytes.slice(pos, pos + 64));
        pos += 64;
      } else {
        controller.close();
      }
    },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: status < 400, status, statusText: 'OK', body: stream }),
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
  mockLookup.mockReset();
  mockAgentCtor.mockReset();
  mockAgentCtor.mockImplementation((opts: unknown) => ({ __opts: opts, close: vi.fn().mockResolvedValue(undefined) }));
});

describe('fetchSkillUrl', () => {
  it('rejects non-HTTPS protocols', async () => {
    await expect(fetchSkillUrl('http://example.com/skill.md')).rejects.toThrow('must use HTTPS');
    await expect(fetchSkillUrl('file:///etc/passwd')).rejects.toThrow('must use HTTPS');
    await expect(fetchSkillUrl('ftp://example.com/skill.md')).rejects.toThrow('must use HTTPS');
  });

  it('rejects bad-input errors (non-HTTPS, SSRF-blocked, non-2xx) as 422 ValidationError, not a bare 500', async () => {
    // Regression: these previously threw plain Error, which the app's global
    // error handler only maps to a status code for AppError subclasses —
    // everything else fell through to a generic 500 internal_error, hiding
    // that the request itself (not the server) was the problem.
    await expect(fetchSkillUrl('http://example.com/skill.md')).rejects.toMatchObject({
      statusCode: 422,
      code: 'validation_error',
    });

    mockLookup.mockResolvedValue({ address: '127.0.0.1', family: 4 });
    await expect(fetchSkillUrl('https://evil.internal/skill.md')).rejects.toMatchObject({
      statusCode: 422,
      code: 'validation_error',
    });

    mockLookup.mockResolvedValue({ address: '93.184.216.34', family: 4 });
    mockFetch('Not found', 404);
    await expect(fetchSkillUrl('https://example.com/missing.md')).rejects.toMatchObject({
      statusCode: 422,
      code: 'validation_error',
    });
  });

  it('rejects an invalid URL', async () => {
    await expect(fetchSkillUrl('not a url')).rejects.toThrow('Invalid skill URL');
  });

  it('blocks when DNS resolves to a private IPv4 address', async () => {
    mockLookup.mockResolvedValue({ address: '127.0.0.1', family: 4 });
    await expect(fetchSkillUrl('https://evil.internal/skill.md')).rejects.toThrow(
      'private or reserved',
    );
  });

  it('blocks cloud metadata endpoint (169.254.169.254)', async () => {
    mockLookup.mockResolvedValue({ address: '169.254.169.254', family: 4 });
    await expect(fetchSkillUrl('https://metadata.internal/latest/meta-data')).rejects.toThrow(
      'private or reserved',
    );
  });

  it('blocks when DNS resolves to IPv6 loopback', async () => {
    mockLookup.mockResolvedValue({ address: '::1', family: 6 });
    await expect(fetchSkillUrl('https://evil.local/skill.md')).rejects.toThrow(
      'private or reserved',
    );
  });

  it('throws when DNS lookup fails', async () => {
    mockLookup.mockRejectedValue(new Error('ENOTFOUND'));
    await expect(fetchSkillUrl('https://doesnotexist.example/skill.md')).rejects.toThrow(
      'Could not resolve',
    );
  });

  it('fetches and returns body text for a public URL', async () => {
    mockLookup.mockResolvedValue({ address: '93.184.216.34', family: 4 });
    mockFetch('# My Skill\nDo the thing.');
    const result = await fetchSkillUrl('https://example.com/skill.md');
    expect(result).toContain('# My Skill');
  });

  it('throws when the server returns a non-2xx status', async () => {
    mockLookup.mockResolvedValue({ address: '93.184.216.34', family: 4 });
    mockFetch('Not found', 404);
    await expect(fetchSkillUrl('https://example.com/missing.md')).rejects.toThrow(
      'Could not fetch skill URL: 404',
    );
  });

  it('pins the connection to the DNS-validated address, ignoring any hostname passed at connect time (DNS rebinding)', async () => {
    mockLookup.mockResolvedValue({ address: '93.184.216.34', family: 4 });
    mockFetch('# My Skill');

    await fetchSkillUrl('https://example.com/skill.md');

    expect(mockAgentCtor).toHaveBeenCalledTimes(1);
    const agentOpts = mockAgentCtor.mock.calls[0][0];
    const lookupCallback = vi.fn();
    // Simulate fetch()'s own internal DNS resolution at connect time: even if it
    // asks about an attacker-controlled hostname, the pinned lookup must ignore
    // it and hand back the address already validated above.
    agentOpts.connect.lookup('attacker-controlled.evil', {}, lookupCallback);
    expect(lookupCallback).toHaveBeenCalledWith(null, '93.184.216.34', 4);
  });

  it('pinned lookup also handles the "all records" callback form Node uses for dual-stack connect', async () => {
    // Node's net connector can call `lookup` with `{ all: true }` (its
    // Happy-Eyeballs dual-stack logic), which expects back an array of
    // {address, family} records instead of a single (address, family) pair.
    // Getting this wrong doesn't surface in mocked-fetch tests — it only
    // breaks against a real socket connect, throwing ERR_INVALID_IP_ADDRESS.
    mockLookup.mockResolvedValue({ address: '93.184.216.34', family: 4 });
    mockFetch('# My Skill');

    await fetchSkillUrl('https://example.com/skill.md');

    const agentOpts = mockAgentCtor.mock.calls[0][0];
    const lookupCallback = vi.fn();
    agentOpts.connect.lookup('attacker-controlled.evil', { all: true }, lookupCallback);
    expect(lookupCallback).toHaveBeenCalledWith(null, [{ address: '93.184.216.34', family: 4 }]);
  });

  it('rejects redirects instead of following them to an internal host', async () => {
    mockLookup.mockResolvedValue({ address: '93.184.216.34', family: 4 });
    // Matches undici's actual shape for redirect: 'error' — verified against a
    // real local HTTP server issuing a 302: the outer error is always
    // `TypeError: fetch failed`, with the real reason on `.cause`.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('fetch failed', { cause: new Error('unexpected redirect') })),
    );
    await expect(fetchSkillUrl('https://example.com/redirects-me.md')).rejects.toMatchObject({
      message: expect.stringContaining('redirects are not allowed'),
      statusCode: 422,
      code: 'validation_error',
    });
  });

  it('does not mask an unrelated fetch failure as a redirect error', async () => {
    mockLookup.mockResolvedValue({ address: '93.184.216.34', family: 4 });
    const originalErr = new TypeError('fetch failed', { cause: new Error('ECONNRESET') });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(originalErr));

    // Must NOT be reworded to the misleading "redirects are not allowed" —
    // wrapped as an ExternalServiceError (502) with the original error
    // preserved as `details`, not silently dropped.
    await expect(fetchSkillUrl('https://example.com/flaky.md')).rejects.not.toThrow(
      'redirects are not allowed',
    );
    await expect(fetchSkillUrl('https://example.com/flaky.md')).rejects.toMatchObject({
      statusCode: 502,
      details: originalErr,
    });
  });

  it('closes the per-request dispatcher after a successful fetch (no lingering socket)', async () => {
    mockLookup.mockResolvedValue({ address: '93.184.216.34', family: 4 });
    mockFetch('# My Skill');

    await fetchSkillUrl('https://example.com/skill.md');

    const dispatcher = mockAgentCtor.mock.results[0]!.value;
    expect(dispatcher.close).toHaveBeenCalledTimes(1);
  });

  it('closes the per-request dispatcher even when the fetch fails', async () => {
    mockLookup.mockResolvedValue({ address: '93.184.216.34', family: 4 });
    mockFetch('Not found', 404);

    await expect(fetchSkillUrl('https://example.com/missing.md')).rejects.toThrow();

    const dispatcher = mockAgentCtor.mock.results[0]!.value;
    expect(dispatcher.close).toHaveBeenCalledTimes(1);
  });

  it('a rejecting dispatcher.close() does not mask the real error from the try block', async () => {
    mockLookup.mockResolvedValue({ address: '93.184.216.34', family: 4 });
    mockAgentCtor.mockImplementation(() => ({
      close: vi.fn().mockRejectedValue(new Error('close() blew up')),
    }));
    mockFetch('Not found', 404);

    // Without swallowing close()'s rejection, this would surface as
    // "close() blew up" instead of the real 404 failure.
    await expect(fetchSkillUrl('https://example.com/missing.md')).rejects.toThrow(
      'Could not fetch skill URL: 404',
    );
  });

  it('a rejecting dispatcher.close() does not mask a successful result', async () => {
    mockLookup.mockResolvedValue({ address: '93.184.216.34', family: 4 });
    mockAgentCtor.mockImplementation(() => ({
      close: vi.fn().mockRejectedValue(new Error('close() blew up')),
    }));
    mockFetch('# My Skill');

    await expect(fetchSkillUrl('https://example.com/skill.md')).resolves.toContain('# My Skill');
  });

  it('a rejecting reader.cancel() on the size-limit path does not surface as an unhandled rejection', async () => {
    mockLookup.mockResolvedValue({ address: '93.184.216.34', family: 4 });
    const bigChunk = new TextEncoder().encode('x'.repeat(2 * 1024 * 1024));
    const stream = new ReadableStream({
      pull(controller) {
        controller.enqueue(bigChunk);
      },
      cancel() {
        return Promise.reject(new Error('stream already errored'));
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK', body: stream }),
    );

    // If cancel()'s rejection weren't caught, this would surface as an
    // unhandled rejection rather than the expected, catchable error.
    await expect(fetchSkillUrl('https://example.com/huge.md')).rejects.toThrow(
      'exceeds 1 MB limit',
    );
  });
});
