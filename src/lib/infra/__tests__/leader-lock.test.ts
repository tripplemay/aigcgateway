import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the Redis module BEFORE importing the SUT. Each test can override
// the mock via `vi.mocked(getRedis).mockReturnValue(...)` to simulate
// Redis availability.
vi.mock("@/lib/redis", () => ({
  getRedis: vi.fn(() => null),
}));

import { getRedis } from "@/lib/redis";
import {
  acquireLeaderLock,
  heartbeatLock,
  releaseLeaderLock,
  __resetLocalLocksForTest,
} from "../leader-lock";

describe("leader-lock fallback (Redis unavailable)", () => {
  beforeEach(() => {
    __resetLocalLocksForTest();
    vi.mocked(getRedis).mockReturnValue(null);
  });

  it("first acquire succeeds, second on same key returns false", async () => {
    expect(await acquireLeaderLock("scheduler", 70)).toBe(true);
    expect(await acquireLeaderLock("scheduler", 70)).toBe(false);
  });

  it("release lets another acquire", async () => {
    expect(await acquireLeaderLock("model-sync", 3600)).toBe(true);
    await releaseLeaderLock("model-sync");
    expect(await acquireLeaderLock("model-sync", 3600)).toBe(true);
  });

  it("heartbeat returns true only while lock is held", async () => {
    expect(await heartbeatLock("scheduler", 70)).toBe(false);
    await acquireLeaderLock("scheduler", 70);
    expect(await heartbeatLock("scheduler", 70)).toBe(true);
    await releaseLeaderLock("scheduler");
    expect(await heartbeatLock("scheduler", 70)).toBe(false);
  });
});

describe("leader-lock with Redis", () => {
  let mockRedis: {
    set: ReturnType<typeof vi.fn>;
    eval: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    __resetLocalLocksForTest();
    mockRedis = {
      set: vi.fn(),
      eval: vi.fn(),
    };
    vi.mocked(getRedis).mockReturnValue(
      mockRedis as unknown as ReturnType<typeof getRedis>,
    );
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

  it("acquire returns false when SET NX reports collision", async () => {
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

  it("release does not blow up when lock is foreign", async () => {
    mockRedis.eval.mockResolvedValue(0);
    await expect(releaseLeaderLock("scheduler")).resolves.toBeUndefined();
  });
});
