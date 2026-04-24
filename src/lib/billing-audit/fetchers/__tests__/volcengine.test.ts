/**
 * BL-BILLING-AUDIT-EXT-P1 F-BAX-06 — Volcengine fetcher 单测。
 *
 * 验证：
 *   1) V4 签名 canonicalRequest 各字段稳定（签名字符串 snapshot）
 *   2) 无账单凭证时抛 BillFetchError
 *   3) 成功响应解析为 BillRecord[]
 *   4) HTTP 错误/非 JSON 错误抛 BillFetchError
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { VolcengineBillFetcher, __testing } from "../volcengine";
import { BillFetchError } from "../tier1-fetcher";

describe("F-BAX-06 Volcengine V4 signing", () => {
  it("signV4 produces stable canonical Authorization header shape", () => {
    // 固定时间避免 amzDate 抖动；signV4 内部 new Date()，所以用 vi.useFakeTimers
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-22T10:30:45Z"));

    const signed = __testing.signV4({
      method: "POST",
      host: "open.volcengineapi.com",
      path: "/",
      query: "Action=ListBillDetail&Version=2022-01-01",
      body: '{"BillPeriod":"2026-04"}',
      accessKey: "AKLTtest",
      secretKey: "SKLTtest==",
      service: "billing",
      region: "cn-beijing",
    });

    expect(signed.url).toBe(
      "https://open.volcengineapi.com/?Action=ListBillDetail&Version=2022-01-01",
    );
    expect(signed.headers.Authorization).toMatch(
      /^HMAC-SHA256 Credential=AKLTtest\/20260422\/cn-beijing\/billing\/request, SignedHeaders=content-type;host;x-content-sha256;x-date, Signature=[a-f0-9]{64}$/,
    );
    expect(signed.headers["X-Date"]).toBe("20260422T103045Z");
    expect(signed.headers["Content-Type"]).toBe("application/json");

    vi.useRealTimers();
  });
});

describe("F-BAX-06 Volcengine fetcher", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-22T10:30:45Z"));
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.useRealTimers();
  });

  it("throws BillFetchError when auth config missing", async () => {
    const f = new VolcengineBillFetcher({});
    await expect(f.fetchDailyBill(new Date("2026-04-22"))).rejects.toThrow(BillFetchError);
  });

  it("parses successful response into BillRecord[] with CNY currency", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          Result: {
            List: [
              {
                BillDay: "2026-04-22",
                InstanceName: "ep-abc123",
                ProductName: "Doubao-Pro",
                PayableAmount: "3.45",
                Count: "1234",
                Currency: "CNY",
              },
            ],
            Total: 1,
          },
          ResponseMetadata: { RequestId: "req-1" },
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    const f = new VolcengineBillFetcher({
      billingAccessKeyId: "AKLTtest",
      billingSecretAccessKey: "SKLTtest==",
    });

    const records = await f.fetchDailyBill(new Date("2026-04-22"));
    expect(records).toHaveLength(1);
    expect(records[0].modelName).toBe("ep-abc123");
    expect(records[0].amount).toBe(3.45);
    expect(records[0].requests).toBe(1234);
    expect(records[0].currency).toBe("CNY");
    expect(records[0].raw).toBeDefined();
  });

  it("raises BillFetchError on HTTP 400", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("InvalidAuthorization", { status: 400 }),
      ) as unknown as typeof fetch;

    const f = new VolcengineBillFetcher({
      billingAccessKeyId: "AKLTtest",
      billingSecretAccessKey: "SKLTtest==",
    });

    await expect(f.fetchDailyBill(new Date("2026-04-22"))).rejects.toThrow(/HTTP 400/);
  });

  it("raises BillFetchError when ResponseMetadata.Error is set", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ResponseMetadata: {
            RequestId: "r1",
            Error: { Code: "InvalidAuthorization", Message: "bad key" },
          },
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    const f = new VolcengineBillFetcher({
      billingAccessKeyId: "AKLTtest",
      billingSecretAccessKey: "SKLTtest==",
    });

    await expect(f.fetchDailyBill(new Date("2026-04-22"))).rejects.toThrow(/InvalidAuthorization/);
  });

  // fix-round-1 Bug 3: modelName fallback 优先级 + 空串过滤
  describe("modelName fallback (fix-round-1 Bug 3)", () => {
    async function fetchOne(item: Record<string, unknown>): Promise<string> {
      global.fetch = vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            Result: { List: [{ BillDay: "2026-04-22", PayableAmount: 1, ...item }] },
          }),
          { status: 200 },
        ),
      ) as unknown as typeof fetch;

      const f = new VolcengineBillFetcher({
        billingAccessKeyId: "AKLTtest",
        billingSecretAccessKey: "SKLTtest==",
      });
      const records = await f.fetchDailyBill(new Date("2026-04-22"));
      return records[0].modelName;
    }

    it("prefers ConfigName over InstanceName", async () => {
      expect(
        await fetchOne({
          ConfigName: "doubao-lite-4k",
          InstanceName: "ep-abc",
          ProductName: "Doubao",
        }),
      ).toBe("doubao-lite-4k");
    });

    it("falls through empty-string InstanceName to ConfigName (the production bug)", async () => {
      expect(
        await fetchOne({
          ConfigName: "doubao-pro-32k",
          InstanceName: "", // production returns empty string here
          ProductName: "Doubao",
        }),
      ).toBe("doubao-pro-32k");
    });

    it("falls back to InstanceName when ConfigName missing but InstanceName non-empty", async () => {
      expect(await fetchOne({ InstanceName: "ep-specific-endpoint", ProductName: "Doubao" })).toBe(
        "ep-specific-endpoint",
      );
    });

    it("falls back to ProductName when both ConfigName and InstanceName empty", async () => {
      expect(await fetchOne({ ConfigName: "", InstanceName: "", ProductName: "Doubao" })).toBe(
        "Doubao",
      );
    });

    it("returns 'unknown' when all three fields empty", async () => {
      expect(await fetchOne({ ConfigName: "", InstanceName: "", ProductName: "" })).toBe("unknown");
    });
  });
});
