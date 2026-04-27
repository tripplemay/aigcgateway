/**
 * BL-BILLING-AUDIT-EXT-P2 F-BAP2-03 — bill_reconciliation 列表查询。
 *
 * BL-RECON-UX-PHASE1 F-RC-01a 增强：
 *   - 新增 query：tier(1|2) / modelSearch / page / pageSize / sort
 *   - 默认 sort=desc（最新在顶，用户明确要求）
 *   - 返回 { data, meta:{ total, page, pageSize } }
 *
 * GET /api/admin/reconciliation
 *   ?start=YYYY-MM-DD&end=YYYY-MM-DD&providerId=&status=&tier=1|2
 *   &modelSearch=&page=1&pageSize=50&sort=desc|asc
 */
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api/admin-guard";
import { parseReconQuery } from "./query";

export async function GET(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const url = new URL(request.url);
  const parsed = await parseReconQuery(url.searchParams);
  if (!parsed.ok) return parsed.error;

  const { where, page, pageSize, sort } = parsed;

  const skip = (page - 1) * pageSize;
  const orderBy: Prisma.BillReconciliationOrderByWithRelationInput[] = [
    { reportDate: sort },
    { computedAt: sort },
  ];

  const [rows, total] = await Promise.all([
    prisma.billReconciliation.findMany({
      where,
      orderBy,
      skip,
      take: pageSize,
      include: {
        provider: { select: { name: true, displayName: true } },
      },
    }),
    prisma.billReconciliation.count({ where }),
  ]);

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
    meta: { total, page, pageSize },
  });
}
