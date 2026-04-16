export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { verifyJwt } from "@/lib/api/jwt-middleware";
import { errorResponse } from "@/lib/api/errors";

type Params = { params: { templateId: string } };

// GET /api/templates/:templateId/rate — current user's rating + aggregate
export async function GET(request: Request, { params }: Params) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  const template = await prisma.template.findUnique({
    where: { id: params.templateId },
    select: { id: true, isPublic: true, ratingCount: true, ratingSum: true },
  });
  if (!template || !template.isPublic) {
    return errorResponse(404, "not_found", "Public template not found");
  }

  const existing = await prisma.templateRating.findUnique({
    where: {
      userId_templateId: { userId: auth.payload.userId, templateId: params.templateId },
    },
    select: { score: true },
  });

  const averageScore = template.ratingCount > 0 ? template.ratingSum / template.ratingCount : 0;

  return NextResponse.json({
    data: {
      averageScore,
      ratingCount: template.ratingCount,
      userScore: existing?.score ?? null,
    },
  });
}

// POST /api/templates/:templateId/rate — upsert rating + atomically update cache
export async function POST(request: Request, { params }: Params) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "invalid_parameter", "Invalid JSON body");
  }

  const rawScore = (body as { score?: unknown })?.score;
  const score = typeof rawScore === "number" ? Math.trunc(rawScore) : NaN;
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    return errorResponse(400, "invalid_parameter", "score must be an integer between 1 and 5");
  }

  const template = await prisma.template.findUnique({
    where: { id: params.templateId },
    select: { id: true, isPublic: true },
  });
  if (!template || !template.isPublic) {
    return errorResponse(404, "not_found", "Public template not found");
  }

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.templateRating.findUnique({
      where: {
        userId_templateId: { userId: auth.payload.userId, templateId: params.templateId },
      },
      select: { id: true, score: true },
    });

    if (existing) {
      const delta = score - existing.score;
      await tx.templateRating.update({
        where: { id: existing.id },
        data: { score },
      });
      if (delta !== 0) {
        await tx.template.update({
          where: { id: params.templateId },
          data: { ratingSum: { increment: delta } },
        });
      }
    } else {
      await tx.templateRating.create({
        data: {
          userId: auth.payload.userId,
          templateId: params.templateId,
          score,
        },
      });
      await tx.template.update({
        where: { id: params.templateId },
        data: {
          ratingSum: { increment: score },
          ratingCount: { increment: 1 },
        },
      });
    }

    const updated = await tx.template.findUnique({
      where: { id: params.templateId },
      select: { ratingCount: true, ratingSum: true },
    });
    return updated;
  });

  const ratingCount = result?.ratingCount ?? 0;
  const ratingSum = result?.ratingSum ?? 0;
  const averageScore = ratingCount > 0 ? ratingSum / ratingCount : 0;

  return NextResponse.json({
    data: {
      averageScore,
      ratingCount,
      userScore: score,
    },
  });
}
