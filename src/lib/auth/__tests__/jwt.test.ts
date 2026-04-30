// @vitest-environment node
/**
 * BL-SEC-AUTH-SESSION F-AS-02 — verifyJwt unit tests.
 *
 * Covers: valid token → payload; empty → throw; tampered signature → throw;
 * expired token → throw; wrong secret → throw; malformed token → throw.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SignJWT } from "jose";
import { verifyJwt } from "../jwt";

const TEST_SECRET = "test-secret-that-is-long-enough-32";

async function makeToken(
  payload: Record<string, unknown>,
  overrides: { secret?: string; expiresIn?: string } = {},
): Promise<string> {
  const secret = new TextEncoder().encode(overrides.secret ?? TEST_SECRET);
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(overrides.expiresIn ?? "1h")
    .sign(secret);
}

describe("verifyJwt", () => {
  let originalSecret: string | undefined;

  beforeEach(() => {
    originalSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });

  it("returns payload for a valid developer token", async () => {
    const token = await makeToken({ userId: "u-123", role: "DEVELOPER" });
    const payload = await verifyJwt(token);
    expect(payload.userId).toBe("u-123");
    expect(payload.role).toBe("DEVELOPER");
    expect(typeof payload.exp).toBe("number");
  });

  it("returns payload for an admin token", async () => {
    const token = await makeToken({ userId: "u-admin", role: "ADMIN" });
    const payload = await verifyJwt(token);
    expect(payload.role).toBe("ADMIN");
  });

  it("throws on empty token", async () => {
    await expect(verifyJwt("")).rejects.toThrow();
  });

  it("throws on tampered signature", async () => {
    const token = await makeToken({ userId: "u-123", role: "DEVELOPER" });
    const tampered = token.slice(0, -4) + "AAAA";
    await expect(verifyJwt(tampered)).rejects.toThrow();
  });

  it("throws on token signed with a different secret", async () => {
    const token = await makeToken(
      { userId: "u-123", role: "DEVELOPER" },
      { secret: "some-other-secret-that-is-long-32" },
    );
    await expect(verifyJwt(token)).rejects.toThrow();
  });

  it("throws on expired token", async () => {
    const token = await makeToken({ userId: "u-123", role: "DEVELOPER" }, { expiresIn: "-1s" });
    await expect(verifyJwt(token)).rejects.toThrow();
  });

  it("throws on malformed token", async () => {
    await expect(verifyJwt("not.a.jwt")).rejects.toThrow();
  });

  it("throws when payload is missing userId", async () => {
    const token = await makeToken({ role: "DEVELOPER" });
    await expect(verifyJwt(token)).rejects.toThrow(/userId/);
  });

  it("throws when role is invalid", async () => {
    const token = await makeToken({ userId: "u-123", role: "HACKER" });
    await expect(verifyJwt(token)).rejects.toThrow(/role/);
  });

  it("throws when JWT_SECRET is not configured", async () => {
    delete process.env.JWT_SECRET;
    const goodToken = await makeToken({ userId: "u-123", role: "DEVELOPER" });
    await expect(verifyJwt(goodToken)).rejects.toThrow(/JWT_SECRET/);
  });
});
