/**
 * BL-BILLING-AUDIT-EXT-P2 F-BAP2-03 — bill_reconciliation 列表查询。
 *
 * GET /api/admin/reconciliation?start=YYYY-MM-DD&end=YYYY-MM-DD
 *   &providerId=&status=BIG_DIFF
 *
 * 返回 reportDate 升序的对账行 + 关联 provider name/displayName。面板的
 * 趋势图 / 明细表共用此接口。
 */
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api/admin-guard";

export async function GET(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const url = new URL(request.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  const providerId = url.searchParams.get("providerId");
  const status = url.searchParams.get("status");

  // 默认查最近 30 天
  const now = new Date();
  const defaultStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const startDate = start ? parseDate(start) : defaultStart;
  const endDate = end ? parseDate(end) : now;
  if (!startDate || !endDate) {
    return NextResponse.json(
      { error: "invalid_parameter", message: "start/end must be YYYY-MM-DD" },
      { status: 400 },
    );
  }

  const rows = await prisma.billReconciliation.findMany({
    where: {
      reportDate: { gte: startDate, lte: endDate },
      ...(providerId ? { providerId } : {}),
      ...(status && ["MATCH", "MINOR_DIFF", "BIG_DIFF"].includes(status) ? { status } : {}),
    },
    orderBy: { reportDate: "asc" },
    include: {
      provider: { select: { name: true, displayName: true } },
    },
  });

  return NextResponse.json({
    data: rows.map((r) => ({
      id: r.id,
      providerId: r.providerId,
      providerName: r.provider.name,
      providerDisplayName: r.provider.displayName,
      reportDate: r.reportDate,
      tier: r.tier,
      modelName: r.modelName,
      upstreamAmount: Number(r.upstreamAmount),
      gatewayAmount: Number(r.gatewayAmount),
      delta: Number(r.delta),
      deltaPercent: r.deltaPercent === null ? null : Number(r.deltaPercent),
      status: r.status,
      details: r.details,
      computedAt: r.computedAt,
    })),
  });
}

function parseDate(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isFinite(d.getTime()) ? d : null;
}
