/**
 * F-BAP2-01 OpenRouterCreditsFetcher 单测。
 *
 * 关键：balance = total_credits - total_usage；totalUsage 必须随 snapshot 一并保存。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OpenRouterCreditsFetcher } from "../openrouter-credits";
import { BalanceFetchError } from "../tier2-fetcher";

describe("F-BAP2-01 OpenRouterCreditsFetcher", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("missing apiKey → BalanceFetchError", async () => {
    const f = new OpenRouterCreditsFetcher({});
    await expect(f.fetchBalanceSnapshot()).rejects.toThrow(BalanceFetchError);
  });

  it("computes balance = total_credits - total_usage and persists totalUsage", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ data: { total_credits: 100, total_usage: 23.45 } }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    const f = new OpenRouterCreditsFetcher({ apiKey: "sk-or-x" });
    const snaps = await f.fetchBalanceSnapshot();
    expect(snaps).toHaveLength(1);
    expect(snaps[0].providerName).toBe("openrouter");
    expect(snaps[0].currency).toBe("USD");
    expect(snaps[0].balance).toBeCloseTo(76.55);
    expect(snaps[0].totalUsage).toBeCloseTo(23.45);
  });

  it("missing total_credits / total_usage → BalanceFetchError", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ data: {} }), { status: 200 }),
    ) as unknown as typeof fetch;

    const f = new OpenRouterCreditsFetcher({ apiKey: "sk-or-x" });
    await expect(f.fetchBalanceSnapshot()).rejects.toThrow(/total_credits/);
  });

  it("HTTP 401 → BalanceFetchError httpCode=401", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response("unauthorized", { status: 401 }),
    ) as unknown as typeof fetch;

    const f = new OpenRouterCreditsFetcher({ apiKey: "sk-bad" });
    try {
      await f.fetchBalanceSnapshot();
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(BalanceFetchError);
      expect((err as BalanceFetchError).httpCode).toBe(401);
    }
  });

  it("uses Bearer auth header", async () => {
    const mock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { total_credits: 1, total_usage: 0 } }), { status: 200 }),
    );
    global.fetch = mock as unknown as typeof fetch;

    const f = new OpenRouterCreditsFetcher({ apiKey: "sk-or-test" });
    await f.fetchBalanceSnapshot();
    const init = mock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-or-test");
  });
});
