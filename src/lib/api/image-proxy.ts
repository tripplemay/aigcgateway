/**
 * AUDIT-CRITICAL-FIX F-ACF-07 — image URL proxy signing helpers.
 *
 * Every image returned by the gateway is rewritten to a /v1/images/proxy/...
 * URL carrying an HMAC signature so the upstream host (bizyair/aliyuncs/
 * ComfyUI/openai.com/...) never leaks to the client.
 */

import { createHmac, timingSafeEqual } from "crypto";

// BL-IMG-PERSIST-GCS F-IGP-03 (D9): images are persisted to GCS and retained
// 90 days (bucket lifecycle). The signed proxy TTL is raised to match so a
// signed URL stays resolvable for the object's whole retention window.
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 90;

function getSecret(): string {
  const secret =
    process.env.IMAGE_PROXY_SECRET || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("IMAGE_PROXY_SECRET (or AUTH_SECRET / NEXTAUTH_SECRET) is required");
  }
  return secret;
}

function sign(traceId: string, idx: number, exp: number): string {
  return createHmac("sha256", getSecret()).update(`${traceId}.${idx}.${exp}`).digest("hex");
}

export function buildProxyUrl(
  traceId: string,
  idx: number,
  origin?: string,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = sign(traceId, idx, exp);
  const path = `/v1/images/proxy/${encodeURIComponent(traceId)}/${idx}?exp=${exp}&sig=${sig}`;
  return origin ? `${origin}${path}` : path;
}

/**
 * Rewrite image response URLs to signed same-origin proxy URLs so callers never
 * see bizyair/aliyuncs/openai.com hostnames (F-ACF-07).
 *
 * BL-IMG-PERSIST-GCS F-IGP-03: when `persistedKeys` is supplied, every
 * persisted image (incl. ones that arrived as `data:` URIs or `b64_json`) gets
 * a proxy URL because the proxy now reads the object back from GCS — this fixes
 * the previous `data:` dead-link and the b64_json-only empty-array bugs. The
 * `b64_json` field is left untouched (D7 — no consumer break).
 *
 * Fallback (persistedKeys absent, or null for an index = D6/D10):
 *   - http(s) URL → proxy URL (legacy upstream fetch in the proxy route)
 *   - `data:` URI → passed through verbatim (inline payload, not proxiable)
 */
export function rewriteImageResponseUrls<
  T extends { data?: Array<{ url?: string; b64_json?: string }> },
>(response: T, traceId: string, origin: string, persistedKeys?: Array<{ key: string } | null>): T {
  const data = (response.data ?? []) as Array<Record<string, unknown>>;
  return {
    ...response,
    data: data.map((d, i) => {
      if (persistedKeys?.[i]) {
        // Persisted to GCS → always a resolvable proxy URL.
        return { ...d, url: buildProxyUrl(traceId, i, origin) };
      }
      const url = typeof d?.url === "string" ? d.url : undefined;
      return {
        ...d,
        url: url && !url.startsWith("data:") ? buildProxyUrl(traceId, i, origin) : url,
      };
    }),
  } as T;
}

export function verifyProxySignature(
  traceId: string,
  idx: number,
  exp: number,
  sig: string,
): { ok: true } | { ok: false; reason: string } {
  if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: "expired" };
  }
  const expected = sign(traceId, idx, exp);
  if (expected.length !== sig.length) return { ok: false, reason: "bad_signature" };
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(sig, "hex");
    if (a.length !== b.length) return { ok: false, reason: "bad_signature" };
    if (!timingSafeEqual(a, b)) return { ok: false, reason: "bad_signature" };
  } catch {
    return { ok: false, reason: "bad_signature" };
  }
  return { ok: true };
}
