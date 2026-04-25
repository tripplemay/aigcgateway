/**
 * F-BAP2-01 SiliconFlowBalanceFetcher 单测。
 *
 * 关键：欠费状态返回 totalBalance="-1.7582"（字符串负数），不能截断到 0。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SiliconFlowBalanceFetcher } from "../siliconflow";
import { BalanceFetchError } from "../tier2-fetcher";

describe("F-BAP2-01 SiliconFlowBalanceFetcher", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("missing apiKey → BalanceFetchError", async () => {
    const f = new SiliconFlowBalanceFetcher({});
    await expect(f.fetchBalanceSnapshot()).rejects.toThrow(BalanceFetchError);
  });

  it("positive totalBalance string → 1 snapshot CNY", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ code: 20000, status: "ok", data: { totalBalance: "42.5", chargeBalance: "10" } }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    const f = new SiliconFlowBalanceFetcher({ apiKey: "sf-test" });
    const snaps = await f.fetchBalanceSnapshot();
    expect(snaps).toHaveLength(1);
    expect(snaps[0].providerName).toBe("siliconflow");
    expect(snaps[0].currency).toBe("CNY");
    expect(snaps[0].balance).toBeCloseTo(42.5);
  });

  it("negative totalBalance (debt) preserved as negative number", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ code: 20000, data: { totalBalance: "-1.7582" } }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    const f = new SiliconFlowBalanceFetcher({ apiKey: "sf-test" });
    const snaps = await f.fetchBalanceSnapshot();
    expect(snaps[0].balance).toBeCloseTo(-1.7582);
  });

  it("HTTP 401 → BalanceFetchError", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response("unauthorized", { status: 401 }),
    ) as unknown as typeof fetch;

    const f = new SiliconFlowBalanceFetcher({ apiKey: "sf-bad" });
    await expect(f.fetchBalanceSnapshot()).rejects.toThrow(/HTTP 401/);
  });

  it("upstream code != 20000 → BalanceFetchError", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ code: 40001, message: "rate limit" }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    const f = new SiliconFlowBalanceFetcher({ apiKey: "sf-test" });
    await expect(f.fetchBalanceSnapshot()).rejects.toThrow(/code=40001/);
  });
});
