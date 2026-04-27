/**
 * BL-RECON-UX-PHASE1 F-RC-01b — CSV 导出端点单测。
 *
 * 覆盖：
 *   - 200 + text/csv;charset=utf-8 + BOM 前缀 + 列顺序
 *   - 数值精度 6 位小数
 *   - Content-Disposition attachment;filename=reconciliation-YYYY-MM-DD.csv
 *   - hard cap 10000 → 400 + row_count_exceeds_cap
 *   - 复用 query.ts 的 filter（providerId / status / sort 等共享 parser）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const findManyMock = vi.fn();
const countMock = vi.fn();
const findManyProvidersMock = vi.fn();
const requireAdminMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    billReconciliation: {
      findMany: (a: unknown) => findManyMock(a),
      count: (a: unknown) => countMock(a),
    },
    provider: { findMany: (a: unknown) => findManyProvidersMock(a) },
  },
}));
vi.mock("@/lib/api/admin-guard", () => ({
  requireAdmin: () => requireAdminMock(),
}));

import { GET as exportGet } from "../route";

beforeEach(() => {
  findManyMock.mockReset();
  countMock.mockReset();
  findManyProvidersMock.mockReset();
  requireAdminMock.mockReset();
  requireAdminMock.mockReturnValue({ ok: true, payload: { userId: "u1", role: "ADMIN" } });
  findManyMock.mockResolvedValue([]);
  countMock.mockResolvedValue(0);
  findManyProvidersMock.mockResolvedValue([]);
});

function makeReq(url: string): Request {
  return new Request(`https://example.com${url}`);
}

describe("F-RC-01b GET /api/admin/reconciliation/export", () => {
  it("returns 200 with text/csv content-type + UTF-8 BOM + correct header row", async () => {
    countMock.mockResolvedValueOnce(1);
    findManyMock.mockResolvedValueOnce([
      {
        id: "r1",
        providerId: "p1",
        provider: { name: "volcengine" },
        reportDate: new Date("2026-04-22T00:00:00Z"),
        tier: 1,
        modelName: "ep-abc",
        upstreamAmount: 3.5,
        gatewayAmount: 3.4,
        delta: -0.1,
        deltaPercent: -2.857143,
        status: "MATCH",
        details: {},
        computedAt: new Date("2026-04-22T05:00:00Z"),
      },
    ]);

    const res = await exportGet(makeReq("/api/admin/reconciliation/export"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");

    // 直接读 raw bytes 校验 BOM（Response.text() 走 TextDecoder 默认会吞 BOM）
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    expect(bytes[0]).toBe(0xef);
    expect(bytes[1]).toBe(0xbb);
    expect(bytes[2]).toBe(0xbf);

    const text = new TextDecoder("utf-8").decode(buf);
    // text-decoder 默认 stripBOM=true → 不需要再 slice(1)
    const lines = text.split("\r\n").filter((l) => l.length > 0);
    expect(lines[0]).toBe(
      "reportDate,tier,providerName,modelName,upstreamAmount,gatewayAmount,delta,deltaPercent,status,computedAt",
    );
    // 数值列 6 位小数
    expect(lines[1]).toContain("3.500000");
    expect(lines[1]).toContain("3.400000");
    expect(lines[1]).toContain("-0.100000");
    expect(lines[1]).toContain("MATCH");
    expect(lines[1]).toContain("ep-abc");
  });

  it("Content-Disposition is attachment with reconciliation-YYYY-MM-DD.csv filename", async () => {
    countMock.mockResolvedValueOnce(0);
    const res = await exportGet(makeReq("/api/admin/reconciliation/export"));
    const cd = res.headers.get("Content-Disposition") ?? "";
    expect(cd).toMatch(/^attachment;\s*filename="reconciliation-\d{4}-\d{2}-\d{2}\.csv"$/);
  });

  it("rejects with 400 when row count exceeds 10000 hard cap", async () => {
    countMock.mockResolvedValueOnce(10001);
    const res = await exportGet(makeReq("/api/admin/reconciliation/export"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("row_count_exceeds_cap");
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it("exactly 10000 rows is allowed (cap is exclusive — uses >)", async () => {
    countMock.mockResolvedValueOnce(10000);
    findManyMock.mockResolvedValueOnce([]);
    const res = await exportGet(makeReq("/api/admin/reconciliation/export"));
    expect(res.status).toBe(200);
    expect(findManyMock).toHaveBeenCalledTimes(1);
    expect(findManyMock.mock.calls[0][0].take).toBe(10000);
  });

  it("escapes commas and quotes in modelName", async () => {
    countMock.mockResolvedValueOnce(1);
    findManyMock.mockResolvedValueOnce([
      {
        id: "r1",
        providerId: "p1",
        provider: { name: "openai" },
        reportDate: new Date("2026-04-22T00:00:00Z"),
        tier: 1,
        modelName: 'gpt-4o,"weird"',
        upstreamAmount: 1,
        gatewayAmount: 1,
        delta: 0,
        deltaPercent: 0,
        status: "MATCH",
        details: {},
        computedAt: new Date("2026-04-22T05:00:00Z"),
      },
    ]);

    const res = await exportGet(makeReq("/api/admin/reconciliation/export"));
    const text = (await res.text()).slice(1); // strip BOM
    // CSV quoting: " → "" inside quoted field
    expect(text).toContain('"gpt-4o,""weird"""');
  });

  it("respects shared filter — status param flows into where via parseReconQuery", async () => {
    countMock.mockResolvedValueOnce(0);
    await exportGet(makeReq("/api/admin/reconciliation/export?status=BIG_DIFF"));
    const where = countMock.mock.calls[0][0].where;
    expect(where.AND).toContainEqual({ status: "BIG_DIFF" });
  });

  it("returns 400 on invalid date param (shared parser)", async () => {
    const res = await exportGet(makeReq("/api/admin/reconciliation/export?start=not-a-date"));
    expect(res.status).toBe(400);
  });
});
