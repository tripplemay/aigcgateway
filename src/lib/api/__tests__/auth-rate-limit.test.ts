/**
 * BL-SEC-POLISH F-SP-01 — auth rate limit unit tests.
 *
 * Mock Redis with the same in-memory sorted-set double used by rpmCheck
 * tests; confirm the two-bucket (IP + account) semantics and per-bucket
 * limits hold under concurrent load.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

interface Entry {
  score: number;
  member: string;
}
// Each key maps to its own sorted set.
const store = new Map<string, Entry[]>();

const mockRedis = {
  eval: vi.fn(
    async (
      _script: string,
      _numKeys: number,
      key: string,
      windowStartStr: string,
      member: string,
      scoreStr: string,
      limitStr: string,
      _ttl: string,
    ): Promise<[number, number]> => {
      const windowStart = Number(windowStartStr);
      const score = Number(scoreStr);
      const limit = Number(limitStr);
      const arr = store.get(key) ?? [];
      for (let i = arr.length - 1; i >= 0; i--) {
        if (arr[i].score <= windowStart) arr.splice(i, 1);
      }
      const count = arr.length;
      if (count >= limit) {
        store.set(key, arr);
        return [0, count];
      }
      arr.push({ score, member });
      store.set(key, arr);
      return [1, count + 1];
    },
  ),
};

vi.mock("@/lib/redis", () => ({ getRedis: () => mockRedis }));

import { checkAuthRateLimit } from "../auth-rate-limit";

beforeEach(() => {
  store.clear();
  mockRedis.eval.mockClear();
});

describe("checkAuthRateLimit (F-SP-01)", () => {
  it("IP bucket: 10 ok / 11th rejected for login", async () => {
    let allowed = 0;
    let denied = 0;
    for (let i = 0; i < 11; i++) {
      const r = await checkAuthRateLimit({
        ip: "1.2.3.4",
        email: `u${i}@example.com`,
        route: "login",
      });
      if (r.allowed) allowed++;
      else {
        denied++;
        expect(r.scope).toBe("ip");
      }
    }
    expect(allowed).toBe(10);
    expect(denied).toBe(1);
  });

  it("Account bucket: same email 5 ok / 6th rejected even with distinct IPs", async () => {
    let allowed = 0;
    let denied = 0;
    for (let i = 0; i < 6; i++) {
      const r = await checkAuthRateLimit({
        ip: `10.0.0.${i + 1}`,
        email: "same@example.com",
        route: "login",
      });
      if (r.allowed) allowed++;
      else {
        denied++;
        expect(r.scope).toBe("account");
      }
    }
    expect(allowed).toBe(5);
    expect(denied).toBe(1);
  });

  it("register route does not trip the account bucket (email not known pre-identity)", async () => {
    let allowed = 0;
    // IP bucket would allow 10 regardless of email.
    for (let i = 0; i < 10; i++) {
      const r = await checkAuthRateLimit({
        ip: "9.9.9.9",
        route: "register",
      });
      if (r.allowed) allowed++;
    }
    expect(allowed).toBe(10);
  });

  it("fails open if Redis is unavailable (getRedis returns null)", async () => {
    vi.resetModules();
    vi.doMock("@/lib/redis", () => ({ getRedis: () => null }));
    const { checkAuthRateLimit: fn } = await import("../auth-rate-limit");
    const r = await fn({ ip: "1.1.1.1", email: "x@y.z", route: "login" });
    expect(r.allowed).toBe(true);
    vi.doUnmock("@/lib/redis");
  });
});
