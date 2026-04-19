/**
 * BL-SEC-POLISH F-SP-02 — url-safety unit tests.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("node:dns", () => {
  return {
    promises: {
      lookup: vi.fn(async (host: string) => {
        // Deterministic resolver: test-only domain map. Real DNS must not be
        // called in unit tests.
        const map: Record<string, { address: string; family: 4 | 6 }[]> = {
          "ok.example.com": [{ address: "93.184.216.34", family: 4 }],
          "evil.example.com": [{ address: "169.254.169.254", family: 4 }],
          "lan.example.com": [{ address: "10.0.0.5", family: 4 }],
          "loop.example.com": [{ address: "::1", family: 6 }],
        };
        if (!(host in map)) {
          const err = new Error(`ENOTFOUND ${host}`);
          throw err;
        }
        return map[host];
      }),
    },
    default: { promises: {} },
  };
});

import { isSafeWebhookUrl, sanitizeImageContentType } from "../url-safety";

describe("isSafeWebhookUrl (F-SP-02)", () => {
  it("rejects non-https URLs", async () => {
    const r = await isSafeWebhookUrl("http://ok.example.com/hook");
    expect(r.safe).toBe(false);
    expect(r.reason).toBe("non-https");
  });

  it("rejects literal RFC1918 IP URLs", async () => {
    const r = await isSafeWebhookUrl("https://10.0.0.1/hook");
    expect(r.safe).toBe(false);
    expect(r.reason).toBe("RFC1918");
  });

  it("rejects AWS metadata IP", async () => {
    const r = await isSafeWebhookUrl("https://169.254.169.254/latest/meta-data");
    expect(r.safe).toBe(false);
    expect(r.reason).toContain("link-local");
  });

  it("rejects IPv6 loopback", async () => {
    const r = await isSafeWebhookUrl("https://[::1]/hook");
    expect(r.safe).toBe(false);
    expect(r.reason).toBe("ipv6-loopback");
  });

  it("rejects hostnames that resolve to private IPs", async () => {
    const r = await isSafeWebhookUrl("https://lan.example.com/hook");
    expect(r.safe).toBe(false);
    expect(r.reason).toBe("RFC1918");
  });

  it("rejects hostnames that resolve to metadata IP", async () => {
    const r = await isSafeWebhookUrl("https://evil.example.com/hook");
    expect(r.safe).toBe(false);
    expect(r.reason).toContain("link-local");
  });

  it("accepts a public https URL whose DNS points at a public IP", async () => {
    const r = await isSafeWebhookUrl("https://ok.example.com/hook");
    expect(r.safe).toBe(true);
  });

  it("rejects malformed URL strings", async () => {
    const r = await isSafeWebhookUrl("not a url");
    expect(r.safe).toBe(false);
    expect(r.reason).toBe("invalid-url");
  });

  it("rejects hostnames with no DNS record", async () => {
    const r = await isSafeWebhookUrl("https://does-not-exist.example.com/hook");
    expect(r.safe).toBe(false);
    expect(r.reason).toMatch(/^dns-failed:/);
  });
});

describe("sanitizeImageContentType (F-SP-02)", () => {
  it("passes canonical image MIME types", () => {
    expect(sanitizeImageContentType("image/jpeg")).toBe("image/jpeg");
    expect(sanitizeImageContentType("image/png")).toBe("image/png");
    expect(sanitizeImageContentType("image/webp")).toBe("image/webp");
    expect(sanitizeImageContentType("image/svg+xml")).toBe("image/svg+xml");
  });

  it("strips parameters then whitelists", () => {
    expect(sanitizeImageContentType("image/jpeg; charset=utf-8")).toBe("image/jpeg");
  });

  it("coerces non-image types to octet-stream", () => {
    expect(sanitizeImageContentType("text/html")).toBe("application/octet-stream");
    expect(sanitizeImageContentType("application/javascript")).toBe("application/octet-stream");
  });

  it("defaults to octet-stream when missing", () => {
    expect(sanitizeImageContentType(null)).toBe("application/octet-stream");
    expect(sanitizeImageContentType(undefined)).toBe("application/octet-stream");
    expect(sanitizeImageContentType("")).toBe("application/octet-stream");
  });
});
