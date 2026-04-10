export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import { verifyJwt } from "@/lib/api/jwt-middleware";
import { errorResponse } from "@/lib/api/errors";

/** GET /api/keys — 列出当前用户所有 Key */
export async function GET(request: Request) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim().toLowerCase() ?? "";

  const where = {
    userId: auth.payload.userId,
    ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
  };

  const keys = await prisma.apiKey.findMany({
    where,
    orderBy: { createdAt: "desc" },
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

  return NextResponse.json({
    data: keys.map((k) => ({
      ...k,
      maskedKey: `${k.keyPrefix}...****`,
    })),
  });
}

/** POST /api/keys — 创建 Key（绑定 userId，返回原文仅一次） */
export async function POST(request: Request) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  let body: {
    name?: string;
    description?: string;
    expiresAt?: string | null;
    permissions?: Record<string, boolean>;
    rateLimit?: number | null;
    ipWhitelist?: string[] | null;
  } = {};
  try {
    body = await request.json();
  } catch {
    // all fields optional
  }

  if (body.expiresAt !== undefined && body.expiresAt !== null) {
    const expires = new Date(body.expiresAt);
    if (isNaN(expires.getTime())) {
      return errorResponse(400, "invalid_input", "expiresAt must be a valid ISO8601 datetime");
    }
    if (expires <= new Date()) {
      return errorResponse(400, "invalid_input", "expiresAt must be in the future");
    }
  }

  if (body.rateLimit !== undefined && body.rateLimit !== null) {
    if (typeof body.rateLimit !== "number" || body.rateLimit <= 0) {
      return errorResponse(400, "invalid_input", "rateLimit must be a positive number or null");
    }
  }

  if (body.ipWhitelist !== undefined && body.ipWhitelist !== null) {
    if (!Array.isArray(body.ipWhitelist)) {
      return errorResponse(400, "invalid_input", "ipWhitelist must be an array of IPs/CIDRs or null");
    }
  }

  const rawKey = `pk_${randomBytes(32).toString("hex")}`;
  const keyHash = createHash("sha256").update(rawKey).digest("hex");
  const keyPrefix = rawKey.slice(0, 8);

  const apiKey = await prisma.apiKey.create({
    data: {
      userId: auth.payload.userId,
      keyHash,
      keyPrefix,
      name: body.name ?? null,
      description: body.description ?? null,
      status: "ACTIVE",
      permissions: body.permissions ?? {},
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      rateLimit: body.rateLimit ?? null,
      ipWhitelist:
        body.ipWhitelist !== undefined
          ? body.ipWhitelist === null
            ? Prisma.JsonNull
            : body.ipWhitelist
          : undefined,
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
