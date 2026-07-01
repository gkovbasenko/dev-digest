import dns from 'node:dns/promises';
import { Agent } from 'undici';
import { ValidationError, ExternalServiceError } from '../../platform/errors.js';

const BLOCKED_CIDRS: Array<{ base: number; mask: number }> = [
  { base: cidrBase('127.0.0.0'), mask: 0xff000000 },   // loopback
  { base: cidrBase('10.0.0.0'), mask: 0xff000000 },    // private
  { base: cidrBase('172.16.0.0'), mask: 0xfff00000 },  // private
  { base: cidrBase('192.168.0.0'), mask: 0xffff0000 }, // private
  { base: cidrBase('169.254.0.0'), mask: 0xffff0000 }, // link-local / cloud metadata
  { base: cidrBase('0.0.0.0'), mask: 0xff000000 },     // unspecified
];

function cidrBase(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) | parseInt(octet, 10), 0) >>> 0;
}

export function isBlockedIPv4(ip: string): boolean {
  const addr = cidrBase(ip);
  return BLOCKED_CIDRS.some(({ base, mask }) => (addr & mask) >>> 0 === base);
}

export function isBlockedIPv6(ip: string): boolean {
  const norm = ip.toLowerCase().replace(/^\[|\]$/g, '');
  const ipv4Mapped = norm.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (ipv4Mapped?.[1]) {
    return isBlockedIPv4(ipv4Mapped[1]);
  }
  if (norm === '::1') return true;
  if (norm.startsWith('fc') || norm.startsWith('fd')) return true; // unique-local fc00::/7 (fc00-fdff)

  // Link-local fe80::/10 spans first-hextet values fe80-febf — a 10-bit
  // prefix doesn't land on a hex-digit boundary, so a string prefix check
  // ("fe80") only matches the literal value fe80 and misses fe81-febf
  // (e.g. fe90::1, febf::1). Mask the first hextet's bits instead.
  const firstHextet = parseInt(norm.split(':')[0] || '', 16);
  if (!Number.isNaN(firstHextet) && (firstHextet & 0xffc0) === 0xfe80) return true;

  return false;
}

/**
 * Fetch a remote skill body with SSRF protections:
 *   - HTTPS only
 *   - DNS resolved; blocked if IP is private/reserved
 *   - 10-second timeout
 *   - Response body capped at 1 MB
 */
export async function fetchSkillUrl(rawUrl: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new ValidationError('Invalid skill URL');
  }

  if (parsed.protocol !== 'https:') {
    throw new ValidationError('Skill URL must use HTTPS');
  }

  const { address, family } = await dns.lookup(parsed.hostname).catch(() => {
    throw new ValidationError('Could not resolve skill URL hostname');
  });

  if (family === 4 && isBlockedIPv4(address)) {
    throw new ValidationError('Skill URL resolves to a private or reserved address');
  }
  if (family === 6 && isBlockedIPv6(address)) {
    throw new ValidationError('Skill URL resolves to a private or reserved address');
  }

  // Pin the actual connection to the address just validated above. Without this,
  // fetch() performs its own DNS resolution independently of the check above, so
  // an attacker-controlled DNS server could answer safely here and privately
  // (e.g. 127.0.0.1) at request time — classic DNS rebinding.
  //
  // Node's connector can invoke `lookup` in "return all records" mode
  // (`options.all`, used by its Happy-Eyeballs dual-stack connect logic) as well
  // as the single-address mode — the callback shape differs between the two
  // (`(err, addresses[])` vs `(err, address, family)`). Handling only the
  // single-address form throws `ERR_INVALID_IP_ADDRESS` when Node requests the
  // array form.
  const pinnedDispatcher = new Agent({
    connect: {
      lookup: (_hostname, options, callback) => {
        if (options?.all) {
          callback(null, [{ address, family }]);
        } else {
          callback(null, address, family);
        }
      },
    },
  });

  const MAX_BYTES = 1 * 1024 * 1024;

  try {
    let res: Response;
    try {
      res = await fetch(rawUrl, {
        signal: AbortSignal.timeout(10_000),
        redirect: 'error',
        dispatcher: pinnedDispatcher,
      });
    } catch (err) {
      const cause = err instanceof Error ? err.cause : undefined;
      if (cause instanceof Error && /redirect/i.test(cause.message)) {
        throw new ValidationError('Skill URL redirects are not allowed');
      }
      // Whatever's left (connection refused, TLS failure, our own timeout) is
      // a genuine external-service failure, not a malformed request from our
      // own caller. Carry the original error as `details` so its cause chain
      // isn't lost.
      throw new ExternalServiceError('Could not reach skill URL', err);
    }
    if (!res.ok) {
      throw new ValidationError(`Could not fetch skill URL: ${res.status} ${res.statusText}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new ValidationError('Empty response from skill URL');

    let total = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_BYTES) {
        // Fire-and-forget: cancel() can reject (e.g. the stream already
        // errored) and isn't awaited here, so an unhandled rejection would
        // otherwise propagate and crash the process.
        reader.cancel().catch(() => {});
        throw new ValidationError('Skill URL response exceeds 1 MB limit');
      }
      chunks.push(value);
    }

    return new TextDecoder().decode(Buffer.concat(chunks, total));
  } finally {
    // This dispatcher is scoped to a single request (its `lookup` is pinned to
    // one already-validated address) — nothing else can reuse its connection
    // pool, so close it immediately rather than leaving a keep-alive socket
    // open until undici's own idle timeout.
    await pinnedDispatcher.close();
  }
}
