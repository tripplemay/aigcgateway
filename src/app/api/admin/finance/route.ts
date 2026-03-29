export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";


export async function GET(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const agg = await prisma.callLog.aggregate({
    _count: true,
    _sum: { sellPrice: true, costPrice: true },
  });

  const revenue = Number(agg._sum.sellPrice ?? 0);
  const cost = Number(agg._sum.costPrice ?? 0);

  return NextResponse.json({
    totalCalls: agg._count,
    totalRevenue: revenue,
    totalCost: cost,
    margin: revenue - cost,
    marginPercent: revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0,
  });
}
