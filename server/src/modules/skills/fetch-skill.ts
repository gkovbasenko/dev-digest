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

// Expands any valid textual IPv6 form (compressed via "::", fully written
// out, or a mix) to 8 lowercase, zero-padded 4-digit hex groups. IPv6 has
// many equivalent textual representations for the same address (::1 vs
// 0:0:0:0:0:0:0:1, etc.) — comparing/pattern-matching the raw string only
// catches whichever form happens to be checked for; expanding first makes
// every check below correct regardless of which form was given. Returns
// null for anything unparseable, which the caller treats as blocked
// (fail closed — an address we can't confidently classify isn't "safe").
function expandIPv6(ip: string): string[] | null {
  const parts = ip.split('::');
  if (parts.length > 2) return null; // more than one "::" is never valid
  let groups: string[];
  if (parts.length === 1) {
    groups = parts[0]!.split(':');
    if (groups.length !== 8) return null;
  } else {
    const head = parts[0] ? parts[0].split(':') : [];
    const tail = parts[1] ? parts[1].split(':') : [];
    const missing = 8 - head.length - tail.length;
    if (missing < 1) return null; // "::" must compress at least one group
    groups = [...head, ...Array(missing).fill('0'), ...tail];
  }
  if (groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => g.padStart(4, '0'));
}

export function isBlockedIPv6(ip: string): boolean {
  const norm = ip.toLowerCase().replace(/^\[|\]$/g, '');
  const ipv4Mapped = norm.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (ipv4Mapped?.[1]) {
    return isBlockedIPv4(ipv4Mapped[1]);
  }

  const groups = expandIPv6(norm);
  if (!groups) return true;

  // Loopback (::1) and unspecified (::) — any textual form (including fully
  // expanded, e.g. 0:0:0:0:0:0:0:1) normalizes to the same 8 groups here.
  if (groups.slice(0, 7).every((g) => g === '0000') && (groups[7] === '0001' || groups[7] === '0000')) {
    return true;
  }

  // Unique-local fc00::/7 (fc00-fdff) — a 7-bit prefix that happens to split
  // evenly across the two hex values fc/fd, so a prefix check on the
  // (now-normalized) first group is exact, not a coincidence-of-width bug.
  if (groups[0]!.startsWith('fc') || groups[0]!.startsWith('fd')) return true;

  // Link-local fe80::/10 spans first-hextet values fe80-febf — a 10-bit
  // prefix doesn't land on a hex-digit boundary, so mask the bits instead
  // of string-prefix-matching (which would only catch the literal "fe80").
  if ((parseInt(groups[0]!, 16) & 0xffc0) === 0xfe80) return true;

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
      // Fetch the parsed/validated URL, not rawUrl — guarantees fetch() connects
      // to exactly what new URL() parsed and the protocol check above ran
      // against, rather than relying on two separate URL parses staying in sync.
      res = await fetch(parsed.href, {
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
    // open until undici's own idle timeout. Swallow any close() rejection: a
    // throw here would replace whatever error the try block was already
    // propagating (or the successful return value), masking the real outcome
    // with an unrelated cleanup failure.
    await pinnedDispatcher.close().catch(() => {});
  }
}
