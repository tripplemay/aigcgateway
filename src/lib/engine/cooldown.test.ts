import { describe, it, expect, vi, beforeEach } from "vitest";

type RedisMock = {
  set: ReturnType<typeof vi.fn>;
  mget: ReturnType<typeof vi.fn>;
};

let currentRedis: RedisMock | null = null;

vi.mock("@/lib/redis", () => ({
  getRedis: () => currentRedis,
}));

import {
  markChannelCooldown,
  getCooldownChannelIds,
  __testing,
} from "./cooldown";

function makeRedis(): RedisMock {
  return {
    set: vi.fn().mockResolvedValue("OK"),
    mget: vi.fn().mockResolvedValue([]),
  };
}

describe("markChannelCooldown (F-RR2-02)", () => {
  beforeEach(() => {
    currentRedis = null;
  });

  it("writes channel:cooldown:<id> with 300s TTL when Redis is up", async () => {
    const redis = makeRedis();
    currentRedis = redis;

    await markChannelCooldown("ch_1", "rate_limited");

    expect(redis.set).toHaveBeenCalledTimes(1);
    const [key, value, mode, ttl] = redis.set.mock.calls[0];
    expect(key).toBe(`${__testing.KEY_PREFIX}ch_1`);
    expect(value).toMatch(/^rate_limited:/);
    expect(mode).toBe("EX");
    expect(ttl).toBe(__testing.TTL_SECONDS);
  });

  it("degrades silently (console.warn, no throw) when Redis is unavailable", async () => {
    currentRedis = null;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(markChannelCooldown("ch_1", "timeout")).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("swallows Redis errors rather than surfacing to caller", async () => {
    const redis = makeRedis();
    redis.set.mockRejectedValueOnce(new Error("CONNRESET"));
    currentRedis = redis;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(markChannelCooldown("ch_1", "rate_limited")).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});

describe("getCooldownChannelIds (F-RR2-02)", () => {
  beforeEach(() => {
    currentRedis = null;
  });

  it("returns the subset of ids whose keys exist in Redis", async () => {
    const redis = makeRedis();
    redis.mget.mockResolvedValueOnce(["rate_limited:2026-04-17T00:00:00.000Z", null, "timeout:…"]);
    currentRedis = redis;

    const result = await getCooldownChannelIds(["a", "b", "c"]);

    expect(result).toEqual(new Set(["a", "c"]));
    expect(redis.mget).toHaveBeenCalledWith(
      `${__testing.KEY_PREFIX}a`,
      `${__testing.KEY_PREFIX}b`,
      `${__testing.KEY_PREFIX}c`,
    );
  });

  it("returns empty Set when Redis is unavailable (fail-open)", async () => {
    currentRedis = null;
    const result = await getCooldownChannelIds(["a", "b"]);
    expect(result.size).toBe(0);
  });

  it("returns empty Set on Redis error (fail-open, no throw)", async () => {
    const redis = makeRedis();
    redis.mget.mockRejectedValueOnce(new Error("boom"));
    currentRedis = redis;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await getCooldownChannelIds(["a"]);
    expect(result.size).toBe(0);

    warnSpy.mockRestore();
  });

  it("short-circuits on empty input without touching Redis", async () => {
    const redis = makeRedis();
    currentRedis = redis;
    const result = await getCooldownChannelIds([]);
    expect(result.size).toBe(0);
    expect(redis.mget).not.toHaveBeenCalled();
  });
});
