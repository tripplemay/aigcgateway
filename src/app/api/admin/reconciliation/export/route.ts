/**
 * BL-RECON-UX-PHASE1 F-RC-01b — bill_reconciliation CSV 导出。
 *
 * GET /api/admin/reconciliation/export?<同列表 API filter，无 page/pageSize>
 *
 * - 复用 ../query.ts 的 parseReconQuery（统一 filter 语义）
 * - 无分页，但 hard cap take=10000 防误导出全量
 * - 超 cap → 400 + 错误 message（前端 toast 提示缩小筛选范围）
 * - UTF-8 + BOM 前缀让 Excel 正确识别中文
 * - 列顺序固定：reportDate,tier,providerName,modelName,upstreamAmount,gatewayAmount,delta,deltaPercent,status,computedAt
 * - 数值列保留 6 位小数（与 schema Decimal(12,6) 对齐）
 */
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api/admin-guard";
import { errorResponse } from "@/lib/api/errors";
import { parseReconQuery } from "../query";

const HARD_CAP = 10000;
const CSV_COLUMNS = [
  "reportDate",
  "tier",
  "providerName",
  "modelName",
  "upstreamAmount",
  "gatewayAmount",
  "delta",
  "deltaPercent",
  "status",
  "computedAt",
] as const;

export async function GET(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const url = new URL(request.url);
  const parsed = await parseReconQuery(url.searchParams);
  if (!parsed.ok) return parsed.error;

  const { where, sort } = parsed;
  const orderBy: Prisma.BillReconciliationOrderByWithRelationInput[] = [
    { reportDate: sort },
    { computedAt: sort },
  ];

  // 先 count，超 cap 直接 400
  const total = await prisma.billReconciliation.count({ where });
  if (total > HARD_CAP) {
    return errorResponse(
      400,
      "row_count_exceeds_cap",
      `row count ${total} exceeds ${HARD_CAP}, narrow filter`,
    );
  }

  const rows = await prisma.billReconciliation.findMany({
    where,
    orderBy,
    take: HARD_CAP,
    include: { provider: { select: { name: true } } },
  });

  const lines: string[] = [];
  lines.push(CSV_COLUMNS.join(","));
  for (const r of rows) {
    const cell: Record<(typeof CSV_COLUMNS)[number], string> = {
      reportDate: r.reportDate.toISOString().slice(0, 10),
      tier: String(r.tier),
      providerName: r.provider.name,
      modelName: r.modelName ?? "",
      upstreamAmount: formatDecimal(r.upstreamAmount),
      gatewayAmount: formatDecimal(r.gatewayAmount),
      delta: formatDecimal(r.delta),
      deltaPercent: r.deltaPercent === null ? "" : formatDecimal(r.deltaPercent),
      status: r.status,
      computedAt: r.computedAt.toISOString(),
    };
    lines.push(CSV_COLUMNS.map((col) => csvEscape(cell[col])).join(","));
  }

  // BOM 前缀让 Excel 正确识别 UTF-8（用 escape 确保不被编辑器吃掉）
  const csv = "﻿" + lines.join("\r\n") + "\r\n";
  const filename = `reconciliation-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function formatDecimal(value: Prisma.Decimal | number | null): string {
  if (value === null) return "";
  const n = typeof value === "number" ? value : Number(value);
  return n.toFixed(6);
}

function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
