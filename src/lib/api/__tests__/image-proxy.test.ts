/**
 * BL-SEC-CRED-HARDEN F-CH-01 — image-proxy HMAC secret fallback removal.
 *
 * Covers: env-missing throws, three-level fallback (IMAGE_PROXY_SECRET →
 * AUTH_SECRET → NEXTAUTH_SECRET), sign/verify roundtrip, expired rejection.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

const PROXY_KEYS = ["IMAGE_PROXY_SECRET", "AUTH_SECRET", "NEXTAUTH_SECRET"] as const;

function clearSecrets() {
  for (const key of PROXY_KEYS) delete process.env[key];
}

async function importFresh() {
  // Clear module cache so image-proxy re-reads process.env inside getSecret()
  const mod = await import("../image-proxy");
  return mod;
}

describe("image-proxy secret", () => {
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of PROXY_KEYS) original[key] = process.env[key];
    clearSecrets();
  });

  afterEach(() => {
    for (const key of PROXY_KEYS) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  });

  it("throws when all three secret envs are missing", async () => {
    const { buildProxyUrl } = await importFresh();
    expect(() => buildProxyUrl("trace-1", 0)).toThrow(/IMAGE_PROXY_SECRET/);
  });

  it("throws when all three secret envs are empty strings", async () => {
    process.env.IMAGE_PROXY_SECRET = "";
    process.env.AUTH_SECRET = "";
    process.env.NEXTAUTH_SECRET = "";
    const { buildProxyUrl } = await importFresh();
    expect(() => buildProxyUrl("trace-1", 0)).toThrow(/IMAGE_PROXY_SECRET/);
  });

  it("signs successfully when IMAGE_PROXY_SECRET is set", async () => {
    process.env.IMAGE_PROXY_SECRET = "primary-secret-value-1234567890";
    const { buildProxyUrl } = await importFresh();
    const url = buildProxyUrl("trace-1", 0);
    expect(url).toMatch(/^\/v1\/images\/proxy\/trace-1\/0\?exp=\d+&sig=[a-f0-9]{64}$/);
  });

  it("falls back to AUTH_SECRET when IMAGE_PROXY_SECRET is empty", async () => {
    process.env.AUTH_SECRET = "auth-secret-value-abcdef";
    const { buildProxyUrl } = await importFresh();
    expect(() => buildProxyUrl("trace-1", 0)).not.toThrow();
  });

  it("falls back to NEXTAUTH_SECRET when others are empty", async () => {
    process.env.NEXTAUTH_SECRET = "nextauth-secret-value-ghijkl";
    const { buildProxyUrl } = await importFresh();
    expect(() => buildProxyUrl("trace-1", 0)).not.toThrow();
  });

  it("verifies a freshly signed URL as ok", async () => {
    process.env.IMAGE_PROXY_SECRET = "verify-roundtrip-secret";
    const { buildProxyUrl, verifyProxySignature } = await importFresh();
    const url = buildProxyUrl("trace-roundtrip", 2, undefined, 60);
    const match = url.match(/\?exp=(\d+)&sig=([a-f0-9]+)$/);
    expect(match).toBeTruthy();
    const exp = Number(match![1]);
    const sig = match![2];
    const result = verifyProxySignature("trace-roundtrip", 2, exp, sig);
    expect(result.ok).toBe(true);
  });

  it("rejects expired signatures", async () => {
    process.env.IMAGE_PROXY_SECRET = "expiry-test-secret";
    const { verifyProxySignature } = await importFresh();
    const result = verifyProxySignature("trace-expired", 0, 1, "deadbeef");
    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects mismatched signatures", async () => {
    process.env.IMAGE_PROXY_SECRET = "mismatch-test-secret";
    const { buildProxyUrl, verifyProxySignature } = await importFresh();
    const url = buildProxyUrl("trace-mismatch", 0, undefined, 60);
    const exp = Number(url.match(/exp=(\d+)/)![1]);
    // Flip the first hex char of a valid-looking signature
    const badSig = "a".repeat(64);
    const result = verifyProxySignature("trace-mismatch", 0, exp, badSig);
    expect(result.ok).toBe(false);
  });
});

describe("assertImageProxySecret", () => {
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of PROXY_KEYS) original[key] = process.env[key];
    clearSecrets();
  });

  afterEach(() => {
    for (const key of PROXY_KEYS) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  });

  it("throws when all three envs missing", async () => {
    const { assertImageProxySecret } = await import("@/lib/env");
    expect(() => assertImageProxySecret()).toThrow(/IMAGE_PROXY_SECRET/);
  });

  it("passes when IMAGE_PROXY_SECRET is set", async () => {
    process.env.IMAGE_PROXY_SECRET = "startup-ok";
    const { assertImageProxySecret } = await import("@/lib/env");
    expect(() => assertImageProxySecret()).not.toThrow();
  });
});
