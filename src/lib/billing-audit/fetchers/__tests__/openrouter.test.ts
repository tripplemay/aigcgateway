/**
 * BL-BILLING-AUDIT-EXT-P1 F-BAX-06 — OpenRouter fetcher 单测。
 *
 * 验证：
 *   1) 缺 provisioningKey 抛 BillFetchError
 *   2) 成功响应解析为 BillRecord[]（USD）
 *   3) 401/404 抛 BillFetchError
 *   4) Bearer token 正确附在 Authorization header
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OpenRouterBillFetcher } from "../openrouter";
import { BillFetchError } from "../tier1-fetcher";

describe("F-BAX-06 OpenRouter fetcher", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    // reset
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("throws BillFetchError when provisioningKey missing", async () => {
    const f = new OpenRouterBillFetcher({});
    await expect(f.fetchDailyBill(new Date("2026-04-22"))).rejects.toThrow(/provisioningKey/);
  });

  it("parses activity response into BillRecord[] with USD currency", async () => {
    const mock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [
            {
              date: "2026-04-22",
              model_permaslug: "openai/gpt-4o",
              usage: 12.34,
              requests: 567,
            },
          ],
        }),
        { status: 200 },
      ),
    );
    global.fetch = mock as unknown as typeof fetch;

    const f = new OpenRouterBillFetcher({ provisioningKey: "sk-or-v1-test" });
    const records = await f.fetchDailyBill(new Date("2026-04-22"));

    expect(records).toHaveLength(1);
    expect(records[0].modelName).toBe("openai/gpt-4o");
    expect(records[0].amount).toBe(12.34);
    expect(records[0].requests).toBe(567);
    expect(records[0].currency).toBe("USD");

    // Verify URL + Authorization header
    const call = mock.mock.calls[0];
    expect(String(call[0])).toBe("https://openrouter.ai/api/v1/activity?date=2026-04-22");
    const init = call[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-or-v1-test");
  });

  it("raises BillFetchError on HTTP 401", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("unauthorized", { status: 401 }),
      ) as unknown as typeof fetch;

    const f = new OpenRouterBillFetcher({ provisioningKey: "sk-or-v1-bad" });
    await expect(f.fetchDailyBill(new Date("2026-04-22"))).rejects.toThrow(BillFetchError);
  });

  // fix-round-1 Bug 2: date 两种格式都必须解析成有效 UTC Date
  describe("date parsing (fix-round-1 Bug 2)", () => {
    it("parses date='YYYY-MM-DD' correctly", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ date: "2026-04-22", model: "x", usage: 1, requests: 1 }],
          }),
          { status: 200 },
        ),
      ) as unknown as typeof fetch;

      const f = new OpenRouterBillFetcher({ provisioningKey: "k" });
      const records = await f.fetchDailyBill(new Date("2026-04-22T00:00:00Z"));
      expect(records[0].date.toISOString()).toBe("2026-04-22T00:00:00.000Z");
      expect(Number.isFinite(records[0].date.getTime())).toBe(true);
    });

    it("parses date='YYYY-MM-DD HH:MM:SS' correctly (production format)", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ date: "2026-04-22 12:34:56", model: "x", usage: 1, requests: 1 }],
          }),
          { status: 200 },
        ),
      ) as unknown as typeof fetch;

      const f = new OpenRouterBillFetcher({ provisioningKey: "k" });
      const records = await f.fetchDailyBill(new Date("2026-04-22T00:00:00Z"));
      expect(records[0].date.toISOString()).toBe("2026-04-22T00:00:00.000Z");
      expect(Number.isFinite(records[0].date.getTime())).toBe(true);
    });
  });
});
