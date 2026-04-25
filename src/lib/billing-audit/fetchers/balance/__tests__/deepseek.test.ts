/**
 * F-BAP2-01 DeepSeekBalanceFetcher 单测。
 *
 * 边界用例（铁律 1.3 阈值零基线）：
 *   - 多币种返回 → 写出多条 snapshot（CNY + USD 各一）
 *   - 缺 apiKey → BalanceFetchError
 *   - 401 / 非 JSON / balance_infos 缺失 / network error → BalanceFetchError
 *   - 字符串 balance 正确转 number
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DeepSeekBalanceFetcher } from "../deepseek";
import { BalanceFetchError } from "../tier2-fetcher";

describe("F-BAP2-01 DeepSeekBalanceFetcher", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("missing apiKey → BalanceFetchError", async () => {
    const f = new DeepSeekBalanceFetcher({});
    await expect(f.fetchBalanceSnapshot()).rejects.toThrow(BalanceFetchError);
  });

  it("multi-currency response → 2 snapshots (CNY + USD)", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          is_available: true,
          balance_infos: [
            { currency: "CNY", total_balance: "12.34", granted_balance: "0", topped_up_balance: "12.34" },
            { currency: "USD", total_balance: "1.78", granted_balance: "0", topped_up_balance: "1.78" },
          ],
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    const f = new DeepSeekBalanceFetcher({ apiKey: "sk-test" });
    const snaps = await f.fetchBalanceSnapshot();
    expect(snaps).toHaveLength(2);
    expect(snaps[0].providerName).toBe("deepseek");
    expect(snaps[0].currency).toBe("CNY");
    expect(snaps[0].balance).toBeCloseTo(12.34);
    expect(snaps[1].currency).toBe("USD");
    expect(snaps[1].balance).toBeCloseTo(1.78);
  });

  it("HTTP 401 → BalanceFetchError httpCode=401", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response("unauthorized", { status: 401 }),
    ) as unknown as typeof fetch;

    const f = new DeepSeekBalanceFetcher({ apiKey: "sk-bad" });
    try {
      await f.fetchBalanceSnapshot();
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(BalanceFetchError);
      expect((err as BalanceFetchError).httpCode).toBe(401);
    }
  });

  it("balance_infos missing → BalanceFetchError", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ is_available: true }), { status: 200 }),
    ) as unknown as typeof fetch;

    const f = new DeepSeekBalanceFetcher({ apiKey: "sk-test" });
    await expect(f.fetchBalanceSnapshot()).rejects.toThrow(/balance_infos/);
  });

  it("non-JSON body → BalanceFetchError", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response("<html>", { status: 200 }),
    ) as unknown as typeof fetch;

    const f = new DeepSeekBalanceFetcher({ apiKey: "sk-test" });
    await expect(f.fetchBalanceSnapshot()).rejects.toThrow(/not JSON/);
  });

  it("network error wraps to BalanceFetchError", async () => {
    global.fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("connection refused")) as unknown as typeof fetch;

    const f = new DeepSeekBalanceFetcher({ apiKey: "sk-test" });
    await expect(f.fetchBalanceSnapshot()).rejects.toThrow(/connection refused/);
  });
});
