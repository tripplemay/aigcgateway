/**
 * F-BAP2-03 admin /api/admin/reconciliation 接口单测。
 *
 * BL-RECON-UX-PHASE1 F-RC-01a 扩展：
 *   - sort 默认 desc / 显式 asc
 *   - page / pageSize（默认 50，max 200，越界 clamp）
 *   - tier=1|2 通过 provider name → providerId IN
 *   - modelSearch contains insensitive
 *   - meta.total 与 prisma.count 一致
 *
 * 覆盖（含原有）：
 *   - 默认查最近 30 天 (start/end 缺省)
 *   - status filter
 *   - providerId filter
 *   - 非法 date 格式 → 400
 *   - rerun POST 调用 runReconciliation 并返回汇总
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const findManyMock = vi.fn();
const countMock = vi.fn();
const findManyProvidersMock = vi.fn();
const requireAdminMock = vi.fn();
const runReconciliationMock = vi.fn();

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
vi.mock("@/lib/billing-audit/reconcile-job", async () => {
  // keep classifyTier real (used by query.ts) so tier=1|2 lookup works
  const actual = await vi.importActual<typeof import("@/lib/billing-audit/reconcile-job")>(
    "@/lib/billing-audit/reconcile-job",
  );
  return {
    ...actual,
    runReconciliation: (date: Date, opts?: unknown) => runReconciliationMock(date, opts),
  };
});

import { GET as listGet } from "../route";
import { POST as rerunPost } from "../rerun/route";

beforeEach(() => {
  findManyMock.mockReset();
  countMock.mockReset();
  findManyProvidersMock.mockReset();
  requireAdminMock.mockReset();
  runReconciliationMock.mockReset();
  requireAdminMock.mockReturnValue({ ok: true, payload: { userId: "u1", role: "ADMIN" } });
  findManyMock.mockResolvedValue([]);
  countMock.mockResolvedValue(0);
  findManyProvidersMock.mockResolvedValue([]);
});

function makeReq(url: string, init?: RequestInit): Request {
  return new Request(`https://example.com${url}`, init);
}

describe("F-BAP2-03 GET /api/admin/reconciliation", () => {
  it("returns rows in default 30-day window when no params", async () => {
    findManyMock.mockResolvedValueOnce([
      {
        id: "r1",
        providerId: "p1",
        provider: { name: "volcengine", displayName: "Volcengine" },
        reportDate: new Date("2026-04-22"),
        tier: 1,
        modelName: "ep-abc",
        upstreamAmount: 3.5,
        gatewayAmount: 3.4,
        delta: -0.1,
        deltaPercent: -2.86,
        status: "MATCH",
        details: {},
        computedAt: new Date(),
      },
    ]);
    countMock.mockResolvedValueOnce(1);

    const res = await listGet(makeReq("/api/admin/reconciliation"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].providerName).toBe("volcengine");
    expect(body.data[0].upstreamAmount).toBe(3.5);
    expect(body.meta).toEqual({ total: 1, page: 1, pageSize: 50 });
  });

  it("applies providerId + status filters", async () => {
    await listGet(makeReq("/api/admin/reconciliation?providerId=p1&status=BIG_DIFF"));
    const where = findManyMock.mock.calls[0][0].where;
    // F-RC-01a: where 现在用 AND 数组组合
    expect(where.AND).toContainEqual({ providerId: "p1" });
    expect(where.AND).toContainEqual({ status: "BIG_DIFF" });
  });

  it("ignores unknown status values", async () => {
    await listGet(makeReq("/api/admin/reconciliation?status=BOGUS"));
    const where = findManyMock.mock.calls[0][0].where;
    expect(where.AND.find((c: { status?: string }) => "status" in c)).toBeUndefined();
  });

  it("returns 400 on invalid date format", async () => {
    const res = await listGet(makeReq("/api/admin/reconciliation?start=not-a-date"));
    expect(res.status).toBe(400);
  });
});

describe("F-RC-01a GET /api/admin/reconciliation — pagination + sort + meta", () => {
  it("default sort is desc on reportDate + computedAt", async () => {
    await listGet(makeReq("/api/admin/reconciliation"));
    const orderBy = findManyMock.mock.calls[0][0].orderBy;
    expect(orderBy).toEqual([{ reportDate: "desc" }, { computedAt: "desc" }]);
  });

  it("sort=asc explicit overrides default", async () => {
    await listGet(makeReq("/api/admin/reconciliation?sort=asc"));
    const orderBy = findManyMock.mock.calls[0][0].orderBy;
    expect(orderBy).toEqual([{ reportDate: "asc" }, { computedAt: "asc" }]);
  });

  it("invalid sort value falls back to desc", async () => {
    await listGet(makeReq("/api/admin/reconciliation?sort=bogus"));
    const orderBy = findManyMock.mock.calls[0][0].orderBy;
    expect(orderBy[0]).toEqual({ reportDate: "desc" });
  });

  it("pagination defaults: page=1 pageSize=50, skip=0 take=50", async () => {
    await listGet(makeReq("/api/admin/reconciliation"));
    const args = findManyMock.mock.calls[0][0];
    expect(args.skip).toBe(0);
    expect(args.take).toBe(50);
  });

  it("page=3&pageSize=20 → skip=40 take=20", async () => {
    await listGet(makeReq("/api/admin/reconciliation?page=3&pageSize=20"));
    const args = findManyMock.mock.calls[0][0];
    expect(args.skip).toBe(40);
    expect(args.take).toBe(20);
  });

  it("pageSize is clamped to 200 max", async () => {
    await listGet(makeReq("/api/admin/reconciliation?pageSize=999"));
    const args = findManyMock.mock.calls[0][0];
    expect(args.take).toBe(200);
  });

  it("page < 1 is clamped to 1", async () => {
    await listGet(makeReq("/api/admin/reconciliation?page=0"));
    const args = findManyMock.mock.calls[0][0];
    expect(args.skip).toBe(0);
  });

  it("returns meta with total from count, plus page + pageSize", async () => {
    countMock.mockResolvedValueOnce(137);
    findManyMock.mockResolvedValueOnce([]);
    const res = await listGet(makeReq("/api/admin/reconciliation?page=2&pageSize=50"));
    const body = await res.json();
    expect(body.meta).toEqual({ total: 137, page: 2, pageSize: 50 });
  });
});

describe("F-RC-01a GET /api/admin/reconciliation — tier + modelSearch filters", () => {
  it("tier=1 filters to providers classified as Tier 1 via classifyTier", async () => {
    findManyProvidersMock.mockResolvedValueOnce([
      { id: "pv", name: "volcengine" },
      { id: "po", name: "openrouter" },
      { id: "pa", name: "openai" }, // ChatanyWhere
      { id: "pd", name: "deepseek" }, // tier 2
      { id: "pz", name: "zhipu" }, // tier 3
    ]);

    await listGet(makeReq("/api/admin/reconciliation?tier=1"));
    const where = findManyMock.mock.calls[0][0].where;
    const providerIdInClause = where.AND.find(
      (c: { providerId?: { in?: string[] } }) =>
        typeof c.providerId === "object" && Array.isArray(c.providerId.in),
    );
    expect(providerIdInClause).toBeDefined();
    expect(new Set(providerIdInClause.providerId.in)).toEqual(new Set(["pv", "po", "pa"]));
  });

  it("tier=2 filters to providers classified as Tier 2", async () => {
    findManyProvidersMock.mockResolvedValueOnce([
      { id: "pv", name: "volcengine" },
      { id: "pd", name: "deepseek" },
      { id: "ps", name: "siliconflow" },
    ]);

    await listGet(makeReq("/api/admin/reconciliation?tier=2"));
    const where = findManyMock.mock.calls[0][0].where;
    const providerIdInClause = where.AND.find(
      (c: { providerId?: { in?: string[] } }) =>
        typeof c.providerId === "object" && Array.isArray(c.providerId.in),
    );
    expect(new Set(providerIdInClause.providerId.in)).toEqual(new Set(["pd", "ps"]));
  });

  it("tier=3 (Tier 3 not displayed) is ignored, no providerId filter applied", async () => {
    await listGet(makeReq("/api/admin/reconciliation?tier=3"));
    expect(findManyProvidersMock).not.toHaveBeenCalled();
    const where = findManyMock.mock.calls[0][0].where;
    const providerIdInClause = where.AND.find(
      (c: { providerId?: { in?: string[] } }) =>
        typeof c.providerId === "object" && Array.isArray(c.providerId.in),
    );
    expect(providerIdInClause).toBeUndefined();
  });

  it("modelSearch sets case-insensitive contains filter", async () => {
    await listGet(makeReq("/api/admin/reconciliation?modelSearch=GPT"));
    const where = findManyMock.mock.calls[0][0].where;
    const modelClause = where.AND.find((c: { modelName?: unknown }) => "modelName" in c);
    expect(modelClause).toEqual({ modelName: { contains: "GPT", mode: "insensitive" } });
  });
});

describe("F-BAP2-03 POST /api/admin/reconciliation/rerun", () => {
  it("validates body, calls runReconciliation, returns summary", async () => {
    runReconciliationMock.mockResolvedValueOnce({
      reportDate: new Date("2026-04-22T00:00:00Z"),
      providersInspected: 6,
      rowsWritten: 8,
      bigDiffs: 1,
    });
    const res = await rerunPost(
      makeReq("/api/admin/reconciliation/rerun", {
        method: "POST",
        body: JSON.stringify({ date: "2026-04-22", providerId: "p_volc" }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rowsWritten).toBe(8);
    expect(body.bigDiffs).toBe(1);
    expect(runReconciliationMock).toHaveBeenCalledTimes(1);
    const [date, opts] = runReconciliationMock.mock.calls[0];
    expect((date as Date).toISOString()).toBe("2026-04-22T00:00:00.000Z");
    expect(opts).toEqual({ providerId: "p_volc" });
  });

  it("rejects non-YYYY-MM-DD date with 400", async () => {
    const res = await rerunPost(
      makeReq("/api/admin/reconciliation/rerun", {
        method: "POST",
        body: JSON.stringify({ date: "2026/04/22" }),
      }),
    );
    expect(res.status).toBe(400);
    expect(runReconciliationMock).not.toHaveBeenCalled();
  });

  it("rejects unknown body fields (.strict())", async () => {
    const res = await rerunPost(
      makeReq("/api/admin/reconciliation/rerun", {
        method: "POST",
        body: JSON.stringify({ date: "2026-04-22", evil: "yes" }),
      }),
    );
    expect(res.status).toBe(400);
  });
});
