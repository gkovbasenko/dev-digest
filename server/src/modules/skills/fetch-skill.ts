import dns from 'node:dns/promises';
import { Agent } from 'undici';

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
  return norm === '::1' || norm.startsWith('fc') || norm.startsWith('fd') || norm.startsWith('fe80');
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
    throw new Error('Invalid skill URL');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Skill URL must use HTTPS');
  }

  const { address, family } = await dns.lookup(parsed.hostname).catch(() => {
    throw new Error('Could not resolve skill URL hostname');
  });

  if (family === 4 && isBlockedIPv4(address)) {
    throw new Error('Skill URL resolves to a private or reserved address');
  }
  if (family === 6 && isBlockedIPv6(address)) {
    throw new Error('Skill URL resolves to a private or reserved address');
  }

  // Pin the actual connection to the address just validated above. Without this,
  // fetch() performs its own DNS resolution independently of the check above, so
  // an attacker-controlled DNS server could answer safely here and privately
  // (e.g. 127.0.0.1) at request time — classic DNS rebinding.
  const pinnedDispatcher = new Agent({
    connect: {
      lookup: (_hostname, _options, callback) => {
        callback(null, address, family);
      },
    },
  });

  const MAX_BYTES = 1 * 1024 * 1024;

  let res: Response;
  try {
    res = await fetch(rawUrl, {
      signal: AbortSignal.timeout(10_000),
      redirect: 'error',
      dispatcher: pinnedDispatcher,
    });
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error('Skill URL redirects are not allowed');
    }
    throw err;
  }
  if (!res.ok) {
    throw new Error(`Could not fetch skill URL: ${res.status} ${res.statusText}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('Empty response from skill URL');

  let total = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BYTES) {
      reader.cancel();
      throw new Error('Skill URL response exceeds 1 MB limit');
    }
    chunks.push(value);
  }

  return new TextDecoder().decode(Buffer.concat(chunks, total));
}
