export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import { verifyJwt } from "@/lib/api/jwt-middleware";
import { errorResponse } from "@/lib/api/errors";

/** GET /api/projects/:id/keys — Key 列表（分页 + 搜索） */
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

  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim().toLowerCase() ?? "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "0", 10));
  const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get("limit") ?? "0", 10)));
  const hasPagination = page > 0 && limit > 0;

  const where = {
    projectId: params.id,
    ...(search
      ? { name: { contains: search, mode: "insensitive" as const } }
      : {}),
  };

  const keys = await prisma.apiKey.findMany({
    where,
    orderBy: { createdAt: "desc" },
    ...(hasPagination ? { skip: (page - 1) * limit, take: limit } : {}),
    select: {
      id: true,
      keyPrefix: true,
      name: true,
      description: true,
      status: true,
      permissions: true,
      expiresAt: true,
      lastUsedAt: true,
      createdAt: true,
    },
  });

  const result = {
    data: keys.map((k) => ({
      ...k,
      maskedKey: `${k.keyPrefix}...****`,
    })),
  };

  if (hasPagination) {
    const total = await prisma.apiKey.count({ where });
    return NextResponse.json({
      ...result,
      pagination: { page, limit, total },
    });
  }

  return NextResponse.json(result);
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

  let body: {
    name?: string;
    description?: string;
    expiresAt?: string | null;
    permissions?: Record<string, boolean>;
  } = {};
  try {
    body = await request.json();
  } catch {
    // all fields optional
  }

  // 校验 expiresAt
  if (body.expiresAt !== undefined && body.expiresAt !== null) {
    const expires = new Date(body.expiresAt);
    if (isNaN(expires.getTime())) {
      return errorResponse(400, "invalid_input", "expiresAt must be a valid ISO8601 datetime");
    }
    if (expires <= new Date()) {
      return errorResponse(400, "invalid_input", "expiresAt must be in the future");
    }
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
      description: body.description ?? null,
      status: "ACTIVE",
      permissions: body.permissions ?? {},
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
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
