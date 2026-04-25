/**
 * BL-BILLING-AUDIT-EXT-P2 F-BAP2-03 — Tier 2 余额趋势查询。
 *
 * GET /api/admin/reconciliation/balance-snapshots?providerId=xxx&days=30
 *
 * 给前端余额趋势小图。多币种 provider（DeepSeek）会返回 CNY+USD 两条线。
 */
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api/admin-guard";

export async function GET(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const url = new URL(request.url);
  const providerId = url.searchParams.get("providerId");
  const daysRaw = Number(url.searchParams.get("days") ?? "30");
  const days = Number.isFinite(daysRaw) && daysRaw > 0 && daysRaw <= 365 ? daysRaw : 30;

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await prisma.balanceSnapshot.findMany({
    where: {
      ...(providerId ? { providerId } : {}),
      snapshotAt: { gte: since },
    },
    orderBy: { snapshotAt: "asc" },
    select: {
      id: true,
      providerId: true,
      snapshotAt: true,
      currency: true,
      balance: true,
      totalUsage: true,
    },
  });

  return NextResponse.json({
    data: rows.map((r) => ({
      id: r.id,
      providerId: r.providerId,
      snapshotAt: r.snapshotAt,
      currency: r.currency,
      balance: Number(r.balance),
      totalUsage: r.totalUsage === null ? null : Number(r.totalUsage),
    })),
  });
}
