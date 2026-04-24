export const dynamic = "force-dynamic";
/**
 * POST /api/admin/health/:channelId/probe
 *
 * F-AF2-02: 手动触发 CALL_PROBE（最小成本真实调用）
 * 3 次连续失败自动 DISABLED
 */

import { NextResponse } from "next/server";
import { runCallProbeForChannel } from "@/lib/health/scheduler";
import { requireAdmin } from "@/lib/api/admin-guard";

export async function POST(request: Request, { params }: { params: { channelId: string } }) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const { channelId } = params;

  try {
    const result = await runCallProbeForChannel(channelId, "admin_health");

    if (result === null) {
      return NextResponse.json({
        channelId,
        skipped: true,
        reason: "CALL_PROBE disabled or channel not found or API_REACHABILITY=FAIL",
      });
    }

    return NextResponse.json({
      channelId,
      level: result.level,
      result: result.result,
      latencyMs: result.latencyMs,
      errorMessage: result.errorMessage,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          type: "server_error",
          code: "call_probe_failed",
          message: (err as Error).message,
        },
      },
      { status: 500 },
    );
  }
}
