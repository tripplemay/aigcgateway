export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { errorResponse } from "@/lib/api/errors";
import { getRedis } from "@/lib/redis";

// F-AO2-05: unified progress endpoint per BL-101 spec.
//
// Backs the same Redis keys already written by runModelSync and
// run-inference (`sync:progress`, `inference:progress`), but accepts
// a single query param `jobType=sync|inference` so the frontend can
// keep a single polling helper when it needs to.
//
// Multi-task concurrency works per jobType — a sync and an inference
// can run in parallel and each gets its own key, matching the
// spec's "多任务并发时 key 互不冲突" requirement.
export async function GET(request: Request) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const url = new URL(request.url);
  const jobType = url.searchParams.get("jobType") ?? url.searchParams.get("jobId") ?? "";
  if (jobType !== "sync" && jobType !== "inference") {
    return errorResponse(400, "invalid_request", "jobType must be 'sync' or 'inference'");
  }

  const redis = getRedis();
  if (!redis) {
    return NextResponse.json({ data: null, reason: "redis_unavailable" });
  }

  const key = `${jobType}:progress`;
  try {
    const raw = await redis.get(key);
    if (!raw) return NextResponse.json({ data: null });
    return NextResponse.json({ data: JSON.parse(raw) });
  } catch (err) {
    return errorResponse(500, "redis_error", (err as Error).message);
  }
}
