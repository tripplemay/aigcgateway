/**
 * POST /api/admin/health/:channelId/check
 *
 * 手动触发指定通道三级检查并返回结果
 */

import { NextResponse } from "next/server";
import { checkChannel } from "@/lib/health/scheduler";

export async function POST(
  _request: Request,
  { params }: { params: { channelId: string } },
) {
  const { channelId } = params;

  try {
    const results = await checkChannel(channelId);

    const allPassed = results.every((r) => r.result === "PASS");

    return NextResponse.json({
      channelId,
      overall: allPassed ? "PASS" : "FAIL",
      checks: results.map((r) => ({
        level: r.level,
        result: r.result,
        latencyMs: r.latencyMs,
        errorMessage: r.errorMessage,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          type: "server_error",
          code: "health_check_failed",
          message: (err as Error).message,
        },
      },
      { status: 500 },
    );
  }
}
