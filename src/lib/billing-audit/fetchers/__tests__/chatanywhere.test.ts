/**
 * BL-BILLING-AUDIT-EXT-P1 F-BAX-06 — ChatanyWhere fetcher 单测。
 *
 * 验证：
 *   1) 必须带 User-Agent header（Cloudflare 1010 规避）
 *   2) 缺 apiKey 抛 BillFetchError
 *   3) 成功响应解析为 BillRecord[]
 *   4) 空 body → 返回 []（不抛错，当日无 usage 是正常场景）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ChatanyWhereBillFetcher, __testing } from "../chatanywhere";
import { BillFetchError } from "../tier1-fetcher";

describe("F-BAX-06 ChatanyWhere fetcher", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    // reset
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("throws BillFetchError when apiKey missing", async () => {
    const f = new ChatanyWhereBillFetcher({});
    await expect(f.fetchDailyBill(new Date("2026-04-22"))).rejects.toThrow(
      BillFetchError,
    );
  });

  it("sends User-Agent + Authorization + Content-Type headers", async () => {
    const mock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [] }), { status: 200 }),
    );
    global.fetch = mock as unknown as typeof fetch;

    const f = new ChatanyWhereBillFetcher({ apiKey: "sk-cn-test" });
    await f.fetchDailyBill(new Date("2026-04-22"));

    const [url, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.chatanywhere.org/v1/query/day_usage_details");
    const headers = init.headers as Record<string, string>;
    expect(headers["User-Agent"]).toBe(__testing.UA);
    expect(headers.Authorization).toBe("Bearer sk-cn-test");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ date: "2026-04-22" }));
  });

  it("parses successful usage response", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [{ model: "gpt-4o-mini", amount: 0.12, count: 34 }],
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    const f = new ChatanyWhereBillFetcher({ apiKey: "sk-cn-test" });
    const records = await f.fetchDailyBill(new Date("2026-04-22"));

    expect(records).toHaveLength(1);
    expect(records[0].modelName).toBe("gpt-4o-mini");
    expect(records[0].amount).toBe(0.12);
    expect(records[0].requests).toBe(34);
    expect(records[0].currency).toBe("USD");
  });

  it("returns [] when body is non-JSON (empty day is valid)", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response("", { status: 200 }),
    ) as unknown as typeof fetch;

    const f = new ChatanyWhereBillFetcher({ apiKey: "sk-cn-test" });
    const records = await f.fetchDailyBill(new Date("2026-04-22"));
    expect(records).toEqual([]);
  });

  it("raises BillFetchError on HTTP 403 (Cloudflare 1010)", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response("<html>Error 1010</html>", { status: 403 }),
    ) as unknown as typeof fetch;

    const f = new ChatanyWhereBillFetcher({ apiKey: "sk-cn-test" });
    await expect(f.fetchDailyBill(new Date("2026-04-22"))).rejects.toThrow(/HTTP 403/);
  });
});
