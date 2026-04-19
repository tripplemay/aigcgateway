/**
 * BL-SEC-POLISH F-SP-02 — outbound URL safety guard.
 *
 * Blocks SSRF vectors before any webhook fetch:
 *   - non-https protocol (forces TLS in outbound calls)
 *   - literal IP URLs that fall inside RFC1918 / CGN / loopback / link-local /
 *     cloud metadata / IPv6 unique-local / IPv6 loopback
 *   - hostnames that resolve to any of the above via DNS
 *
 * DNS is checked even when the input is a hostname because an attacker-
 * controlled domain can publish A records pointing at 169.254.169.254.
 */
import { promises as dns } from "node:dns";
import net from "node:net";

// RFC1918 + CGN + loopback + link-local + cloud metadata + AWS fallback
const IPV4_BLOCKS: Array<{ cidr: string; reason: string }> = [
  { cidr: "10.0.0.0/8", reason: "RFC1918" },
  { cidr: "172.16.0.0/12", reason: "RFC1918" },
  { cidr: "192.168.0.0/16", reason: "RFC1918" },
  { cidr: "127.0.0.0/8", reason: "loopback" },
  { cidr: "0.0.0.0/8", reason: "any-addr" },
  { cidr: "169.254.0.0/16", reason: "link-local-and-metadata" },
  { cidr: "100.64.0.0/10", reason: "CGN" },
];

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".");
  if (parts.length !== 4) return -1;
  let n = 0;
  for (const p of parts) {
    const v = Number(p);
    if (!Number.isInteger(v) || v < 0 || v > 255) return -1;
    n = (n * 256 + v) >>> 0;
  }
  return n >>> 0;
}

function inCidr(ipInt: number, cidr: string): boolean {
  const [base, bitsStr] = cidr.split("/");
  const bits = Number(bitsStr);
  const baseInt = ipv4ToInt(base);
  if (baseInt < 0) return false;
  if (bits === 0) return true;
  const mask = bits === 32 ? 0xffffffff : (0xffffffff << (32 - bits)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

function isBlockedIPv4(ip: string): string | null {
  const int = ipv4ToInt(ip);
  if (int < 0) return null;
  for (const b of IPV4_BLOCKS) if (inCidr(int, b.cidr)) return b.reason;
  return null;
}

function isBlockedIPv6(ip: string): string | null {
  const lower = ip.toLowerCase();
  if (lower === "::1") return "ipv6-loopback";
  // fc00::/7 unique-local addresses
  if (/^f[cd][0-9a-f]{2}:/i.test(lower)) return "ipv6-ula";
  // fe80::/10 link-local
  if (/^fe[89ab][0-9a-f]:/i.test(lower)) return "ipv6-link-local";
  return null;
}

export interface UrlSafetyResult {
  safe: boolean;
  reason?: string;
}

/**
 * Returns `{ safe: true }` only when the URL is https and every A/AAAA
 * answer for its hostname lies outside the private/metadata blocklist.
 * Missing DNS is treated as unsafe (caller can retry or surface to user).
 */
export async function isSafeWebhookUrl(url: string): Promise<UrlSafetyResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { safe: false, reason: "invalid-url" };
  }
  if (parsed.protocol !== "https:") {
    return { safe: false, reason: "non-https" };
  }
  // URL.hostname wraps IPv6 literals in brackets (e.g. "[::1]"); strip them
  // before feeding to net.isIP / the block checks.
  const rawHost = parsed.hostname;
  if (!rawHost) return { safe: false, reason: "missing-hostname" };
  const hostname =
    rawHost.startsWith("[") && rawHost.endsWith("]") ? rawHost.slice(1, -1) : rawHost;

  // Literal IP URL — check directly.
  const ipFamily = net.isIP(hostname);
  if (ipFamily) {
    const reason = ipFamily === 4 ? isBlockedIPv4(hostname) : isBlockedIPv6(hostname);
    if (reason) return { safe: false, reason };
    return { safe: true };
  }

  // Hostname — resolve and check every answer.
  let addrs: { address: string; family: number }[];
  try {
    addrs = await dns.lookup(hostname, { all: true });
  } catch (err) {
    return { safe: false, reason: `dns-failed:${(err as Error).message}` };
  }
  for (const { address, family } of addrs) {
    const reason = family === 4 ? isBlockedIPv4(address) : isBlockedIPv6(address);
    if (reason) return { safe: false, reason };
  }
  return { safe: true };
}

// BL-SEC-POLISH F-SP-02: image-proxy Content-Type whitelist.
const IMAGE_CT_PATTERN = /^image\/(jpeg|png|webp|gif|svg\+xml|avif|heic)$/i;

export function sanitizeImageContentType(raw: string | null | undefined): string {
  if (!raw) return "application/octet-stream";
  const primary = raw.split(";")[0].trim().toLowerCase();
  if (IMAGE_CT_PATTERN.test(primary)) return primary;
  return "application/octet-stream";
}
