export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { verifyJwt } from "@/lib/api/jwt-middleware";

/**
 * GET /api/exchange-rate
 * 返回当前 USD→CNY 汇率（任何登录用户可读）
 */
export async function GET(request: Request) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  const config = await prisma.systemConfig.findUnique({
    where: { key: "USD_TO_CNY_RATE" },
  });

  const rate = config ? parseFloat(config.value) : 7.3;

  return NextResponse.json({ rate });
}
