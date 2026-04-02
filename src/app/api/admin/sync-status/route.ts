export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";

// 内存缓存：同步状态变更极少，TTL 30 秒
let cachedData: { data: unknown; expiresAt: number } | null = null;
const CACHE_TTL_MS = 30_000;

export async function GET(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const now = Date.now();
  if (cachedData && cachedData.expiresAt > now) {
    return NextResponse.json({ data: cachedData.data });
  }

  // 合并两次 getConfig 为单次 findMany
  const configs = await prisma.systemConfig.findMany({
    where: { key: { in: ["LAST_SYNC_TIME", "LAST_SYNC_RESULT"] } },
  });
  const configMap = new Map(configs.map((c) => [c.key, c.value]));

  const lastSyncTime = configMap.get("LAST_SYNC_TIME") ?? null;
  const lastSyncResultRaw = configMap.get("LAST_SYNC_RESULT");

  let lastSyncResult = null;
  if (lastSyncResultRaw) {
    try {
      lastSyncResult = JSON.parse(lastSyncResultRaw);
    } catch {
      lastSyncResult = null;
    }
  }

  const responseData = { lastSyncTime, lastSyncResult };
  cachedData = { data: responseData, expiresAt: now + CACHE_TTL_MS };

  return NextResponse.json({ data: responseData });
}
