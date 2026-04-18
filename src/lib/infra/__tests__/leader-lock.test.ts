import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the Redis module BEFORE importing the SUT. Each test overrides
// `getRedis` to either return a Redis stub or null (Redis not ready).
vi.mock("@/lib/redis", () => ({
  getRedis: vi.fn(() => null),
}));

import { getRedis } from "@/lib/redis";
import {
  acquireLeaderLock,
  heartbeatLock,
  releaseLeaderLock,
} from "../leader-lock";

// F-IG-02 fix round 1: leader-lock requires Redis. No in-process fallback.
describe("leader-lock — Redis not ready", () => {
  beforeEach(() => {
    vi.mocked(getRedis).mockReturnValue(null);
  });

  it("acquire returns false so the caller skips starting scheduled jobs", async () => {
    expect(await acquireLeaderLock("scheduler", 70)).toBe(false);
  });

  it("heartbeat returns false so a running scheduler stops", async () => {
    expect(await heartbeatLock("scheduler", 70)).toBe(false);
  });

  it("release is a no-op (no throw)", async () => {
    await expect(releaseLeaderLock("scheduler")).resolves.toBeUndefined();
  });
});

describe("leader-lock — Redis ready", () => {
  let mockRedis: {
    set: ReturnType<typeof vi.fn>;
    eval: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockRedis = {
      set: vi.fn(),
      eval: vi.fn(),
    };
    vi.mocked(getRedis).mockReturnValue(mockRedis as unknown as ReturnType<typeof getRedis>);
  });

  it("acquire uses SET NX EX", async () => {
    mockRedis.set.mockResolvedValue("OK");
    const got = await acquireLeaderLock("scheduler", 70);
    expect(got).toBe(true);
    expect(mockRedis.set).toHaveBeenCalledWith(
      "leader-lock:scheduler",
      expect.any(String),
      "EX",
      70,
      "NX",
    );
  });

  it("acquire returns false when SET NX reports collision (another replica holds the key)", async () => {
    mockRedis.set.mockResolvedValue(null);
    const got = await acquireLeaderLock("scheduler", 70);
    expect(got).toBe(false);
  });

  it("heartbeat only refreshes when token matches (CAS Lua)", async () => {
    mockRedis.eval.mockResolvedValue(1);
    expect(await heartbeatLock("scheduler", 70)).toBe(true);

    mockRedis.eval.mockResolvedValue(0);
    expect(await heartbeatLock("scheduler", 70)).toBe(false);
  });

  it("release does not blow up when lock is foreign (CAS returns 0)", async () => {
    mockRedis.eval.mockResolvedValue(0);
    await expect(releaseLeaderLock("scheduler")).resolves.toBeUndefined();
  });

  it("heartbeat/acquire share a single source of truth (no fallback)", async () => {
    // Simulate the prior race: Redis goes down mid-life. Heartbeat MUST report
    // false so the scheduler stops; it must NOT pretend to own a local lock.
    mockRedis.eval.mockResolvedValue(0);
    expect(await heartbeatLock("scheduler", 70)).toBe(false);

    // Now Redis disappears entirely (simulating REDIS_URL unset / crash).
    vi.mocked(getRedis).mockReturnValue(null);
    expect(await heartbeatLock("scheduler", 70)).toBe(false);
    expect(await acquireLeaderLock("scheduler", 70)).toBe(false);
  });
});
