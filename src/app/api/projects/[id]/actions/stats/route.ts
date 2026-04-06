export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { verifyJwt } from "@/lib/api/jwt-middleware";
import { errorResponse } from "@/lib/api/errors";

/**
 * GET /api/projects/:id/actions/stats
 *
 * Returns action call statistics from CallLog.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  const project = await prisma.project.findFirst({
    where: { id: params.id, userId: auth.payload.userId },
  });
  if (!project) return errorResponse(404, "not_found", "Project not found");

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [totalCalls, recentCalls] = await Promise.all([
    prisma.callLog.count({
      where: { projectId: project.id, actionId: { not: null } },
    }),
    prisma.callLog.count({
      where: { projectId: project.id, actionId: { not: null }, createdAt: { gte: sevenDaysAgo } },
    }),
  ]);

  return NextResponse.json({ totalCalls, recentCalls });
}
