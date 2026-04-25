/**
 * F-BAP2-03 admin /api/admin/reconciliation 接口单测。
 *
 * 覆盖：
 *   - 默认查最近 30 天 (start/end 缺省)
 *   - status filter
 *   - providerId filter
 *   - 非法 date 格式 → 400
 *   - rerun POST 调用 runReconciliation 并返回汇总
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const findManyMock = vi.fn();
const requireAdminMock = vi.fn();
const runReconciliationMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    billReconciliation: { findMany: (a: unknown) => findManyMock(a) },
  },
}));
vi.mock("@/lib/api/admin-guard", () => ({
  requireAdmin: () => requireAdminMock(),
}));
vi.mock("@/lib/billing-audit/reconcile-job", () => ({
  runReconciliation: (date: Date, opts?: unknown) => runReconciliationMock(date, opts),
}));

import { GET as listGet } from "../route";
import { POST as rerunPost } from "../rerun/route";

beforeEach(() => {
  findManyMock.mockReset();
  requireAdminMock.mockReset();
  runReconciliationMock.mockReset();
  requireAdminMock.mockReturnValue({ ok: true, payload: { userId: "u1", role: "ADMIN" } });
  findManyMock.mockResolvedValue([]);
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

    const res = await listGet(makeReq("/api/admin/reconciliation"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].providerName).toBe("volcengine");
    expect(body.data[0].upstreamAmount).toBe(3.5);
  });

  it("applies providerId + status filters", async () => {
    await listGet(makeReq("/api/admin/reconciliation?providerId=p1&status=BIG_DIFF"));
    const where = findManyMock.mock.calls[0][0].where;
    expect(where.providerId).toBe("p1");
    expect(where.status).toBe("BIG_DIFF");
  });

  it("ignores unknown status values", async () => {
    await listGet(makeReq("/api/admin/reconciliation?status=BOGUS"));
    const where = findManyMock.mock.calls[0][0].where;
    expect(where.status).toBeUndefined();
  });

  it("returns 400 on invalid date format", async () => {
    const res = await listGet(makeReq("/api/admin/reconciliation?start=not-a-date"));
    expect(res.status).toBe(400);
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
