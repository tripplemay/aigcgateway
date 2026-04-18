/**
 * AUDIT-CRITICAL-FIX F-ACF-07 — image URL proxy signing helpers.
 *
 * Every image returned by the gateway is rewritten to a /v1/images/proxy/...
 * URL carrying an HMAC signature so the upstream host (bizyair/aliyuncs/
 * ComfyUI/openai.com/...) never leaks to the client.
 */

import { createHmac, timingSafeEqual } from "crypto";

const DEFAULT_TTL_SECONDS = 60 * 60;

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
