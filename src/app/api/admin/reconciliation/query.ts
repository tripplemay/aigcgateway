/**
 * BL-RECON-UX-PHASE1 F-RC-01a — 列表 / 导出共享 query 解析。
 *
 * 单一 source of truth 让 GET /api/admin/reconciliation 与
 * /api/admin/reconciliation/export 复用同一组 filter 语义。
 */
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/api/errors";
import { classifyTier } from "@/lib/billing-audit/reconcile-job";

const STATUS_VALUES = ["MATCH", "MINOR_DIFF", "BIG_DIFF"] as const;
type ReconStatus = (typeof STATUS_VALUES)[number];

export type SortDir = "asc" | "desc";

export interface ParsedReconQuery {
  where: Prisma.BillReconciliationWhereInput;
  page: number;
  pageSize: number;
  sort: SortDir;
}

export type ParseResult =
  | ({ ok: true } & ParsedReconQuery)
  | { ok: false; error: ReturnType<typeof NextResponse.json> };

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

export async function parseReconQuery(params: URLSearchParams): Promise<ParseResult> {
  const start = params.get("start");
  const end = params.get("end");
  const providerId = params.get("providerId");
  const status = params.get("status");
  const tier = params.get("tier");
  const modelSearch = params.get("modelSearch");
  const pageRaw = params.get("page");
  const pageSizeRaw = params.get("pageSize");
  const sortRaw = params.get("sort");

  // 默认查最近 30 天
  const now = new Date();
  const defaultStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const startDate = start ? parseDate(start) : defaultStart;
  const endDate = end ? parseDate(end) : now;
  if (!startDate || !endDate) {
    return {
      ok: false,
      error: errorResponse(400, "invalid_parameter", "start/end must be YYYY-MM-DD"),
    };
  }

  // tier filter — 通过 provider name 反推 ID 列表
  let providerIdIn: string[] | undefined;
  if (tier === "1" || tier === "2") {
    const targetTier = Number(tier) as 1 | 2;
    const providers = await prisma.provider.findMany({ select: { id: true, name: true } });
    providerIdIn = providers.filter((p) => classifyTier(p.name) === targetTier).map((p) => p.id);
    // 若该 tier 没有任何 provider，构造一个不可能命中的 id 让 where 返回空
    if (providerIdIn.length === 0) providerIdIn = ["__no_match__"];
  }

  // 用 AND 数组组合，避免后续条件 spread 覆盖前面的 providerId
  const conditions: Prisma.BillReconciliationWhereInput[] = [
    { reportDate: { gte: startDate, lte: endDate } },
  ];
  if (providerId) conditions.push({ providerId });
  if (providerIdIn) conditions.push({ providerId: { in: providerIdIn } });
  if (status && (STATUS_VALUES as readonly string[]).includes(status)) {
    conditions.push({ status: status as ReconStatus });
  }
  if (modelSearch) {
    conditions.push({ modelName: { contains: modelSearch, mode: "insensitive" } });
  }
  const where: Prisma.BillReconciliationWhereInput = { AND: conditions };

  // pagination
  const page = clampInt(pageRaw, 1, 1, Number.MAX_SAFE_INTEGER);
  const pageSize = clampInt(pageSizeRaw, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);

  const sort: SortDir = sortRaw === "asc" ? "asc" : "desc";

  return { ok: true, where, page, pageSize, sort };
}

function parseDate(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isFinite(d.getTime()) ? d : null;
}

function clampInt(raw: string | null, def: number, min: number, max: number): number {
  if (raw === null || raw === "") return def;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return def;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}
