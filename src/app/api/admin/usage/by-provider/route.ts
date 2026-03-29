import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";

const prisma = new PrismaClient();

export async function GET(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const results = await prisma.$queryRaw<Array<{
    provider_name: string;
    calls: bigint;
    cost: number;
    revenue: number;
  }>>`
    SELECT p.name AS provider_name,
           COUNT(cl.id)::bigint AS calls,
           COALESCE(SUM(cl."costPrice"), 0)::float AS cost,
           COALESCE(SUM(cl."sellPrice"), 0)::float AS revenue
    FROM call_logs cl
    JOIN channels ch ON cl."channelId" = ch.id
    JOIN providers p ON ch."providerId" = p.id
    GROUP BY p.name
    ORDER BY revenue DESC
  `;

  return NextResponse.json({
    data: results.map((r) => ({
      provider: r.provider_name,
      calls: Number(r.calls),
      cost: r.cost,
      revenue: r.revenue,
      margin: r.revenue - r.cost,
      marginPercent: r.revenue > 0 ? ((r.revenue - r.cost) / r.revenue) * 100 : 0,
    })),
  });
}
