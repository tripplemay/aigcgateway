export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import type { SystemLogCategory, SystemLogLevel } from "@prisma/client";

const VALID_CATEGORIES: SystemLogCategory[] = ["SYNC", "INFERENCE", "HEALTH_CHECK", "AUTO_RECOVERY"];
const VALID_LEVELS: SystemLogLevel[] = ["INFO", "WARN", "ERROR"];

export async function GET(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") ?? 20)));
  const category = url.searchParams.get("category")?.toUpperCase() as SystemLogCategory | undefined;
  const level = url.searchParams.get("level")?.toUpperCase() as SystemLogLevel | undefined;

  const where = {
    ...(category && VALID_CATEGORIES.includes(category) ? { category } : {}),
    ...(level && VALID_LEVELS.includes(level) ? { level } : {}),
  };

  const [data, total] = await Promise.all([
    prisma.systemLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.systemLog.count({ where }),
  ]);

  return NextResponse.json({
    data,
    pagination: { total, page, pageSize },
  });
}
