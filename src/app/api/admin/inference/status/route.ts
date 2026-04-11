export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { getRedis } from "@/lib/redis";

export async function GET(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const redis = getRedis();
  if (!redis) {
    return NextResponse.json({ data: null });
  }

  const raw = await redis.get("inference:progress");
  if (!raw) {
    return NextResponse.json({ data: null });
  }

  return NextResponse.json({ data: JSON.parse(raw) });
}
