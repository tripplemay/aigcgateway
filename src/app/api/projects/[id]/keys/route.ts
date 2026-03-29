export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import { verifyJwt } from "@/lib/api/jwt-middleware";
import { errorResponse } from "@/lib/api/errors";


/** GET /api/projects/:id/keys — Key 列表（仅显示 prefix 掩码） */
export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  const project = await prisma.project.findFirst({
    where: { id: params.id, userId: auth.payload.userId },
  });
  if (!project) return errorResponse(404, "not_found", "Project not found");

  const keys = await prisma.apiKey.findMany({
    where: { projectId: params.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      keyPrefix: true,
      name: true,
      status: true,
      lastUsedAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    data: keys.map((k) => ({
      ...k,
      maskedKey: `${k.keyPrefix}...****`,
    })),
  });
}

/** POST /api/projects/:id/keys — 生成 Key（返回原文仅一次） */
export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  const project = await prisma.project.findFirst({
    where: { id: params.id, userId: auth.payload.userId },
  });
  if (!project) return errorResponse(404, "not_found", "Project not found");

  let body: { name?: string } = {};
  try {
    body = await request.json();
  } catch {
    // name is optional
  }

  // 生成 Key: pk_ + 64 位随机 hex
  const rawKey = `pk_${randomBytes(32).toString("hex")}`;
  const keyHash = createHash("sha256").update(rawKey).digest("hex");
  const keyPrefix = rawKey.slice(0, 8);

  const apiKey = await prisma.apiKey.create({
    data: {
      projectId: params.id,
      keyHash,
      keyPrefix,
      name: body.name ?? null,
      status: "ACTIVE",
    },
  });

  return NextResponse.json(
    {
      id: apiKey.id,
      name: apiKey.name,
      key: rawKey,
      prefix: keyPrefix,
      status: apiKey.status.toLowerCase(),
      createdAt: apiKey.createdAt,
    },
    { status: 201 },
  );
}
