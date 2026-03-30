export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { getConfig } from "@/lib/config";

export async function GET(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const lastSyncTime = await getConfig("LAST_SYNC_TIME");
  const lastSyncResultRaw = await getConfig("LAST_SYNC_RESULT");

  let lastSyncResult = null;
  if (lastSyncResultRaw) {
    try {
      lastSyncResult = JSON.parse(lastSyncResultRaw);
    } catch {
      lastSyncResult = null;
    }
  }

  return NextResponse.json({
    data: {
      lastSyncTime: lastSyncTime ?? null,
      lastSyncResult,
    },
  });
}
