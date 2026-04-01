export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { verifyJwt } from "@/lib/api/jwt-middleware";
import { errorResponse } from "@/lib/api/errors";
import { isValidIpOrCidr } from "@/lib/api/ip-utils";

type Params = { params: { id: string; keyId: string } };

/** 项目归属校验 — 复用于 GET/PATCH/DELETE */
async function verifyOwnership(request: Request, params: { id: string; keyId: string }) {
  const auth = verifyJwt(request);
  if (!auth.ok) return { ok: false as const, error: auth.error };

  const project = await prisma.project.findFirst({
    where: { id: params.id, userId: auth.payload.userId },
  });
  if (!project) return { ok: false as const, error: errorResponse(404, "not_found", "Project not found") };

  const apiKey = await prisma.apiKey.findFirst({
    where: { id: params.keyId, projectId: params.id },
  });
  if (!apiKey) return { ok: false as const, error: errorResponse(404, "not_found", "API Key not found") };

  return { ok: true as const, project, apiKey };
}

/** GET /api/projects/:id/keys/:keyId — Key 详情 */
export async function GET(request: Request, { params }: Params) {
  const result = await verifyOwnership(request, params);
  if (!result.ok) return result.error;

  const k = result.apiKey;
  return NextResponse.json({
    data: {
      id: k.id,
      keyPrefix: k.keyPrefix,
      maskedKey: `${k.keyPrefix}...****`,
      name: k.name,
      description: k.description,
      status: k.status,
      permissions: k.permissions,
      expiresAt: k.expiresAt,
      rateLimit: k.rateLimit,
      ipWhitelist: k.ipWhitelist,
      lastUsedAt: k.lastUsedAt,
      createdAt: k.createdAt,
      updatedAt: k.updatedAt,
    },
  });
}

/** PATCH /api/projects/:id/keys/:keyId — 编辑 Key */
export async function PATCH(request: Request, { params }: Params) {
  const result = await verifyOwnership(request, params);
  if (!result.ok) return result.error;

  if (result.apiKey.status === "REVOKED") {
    return errorResponse(400, "key_revoked", "Cannot edit a revoked API key");
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "invalid_input", "Invalid JSON body");
  }

  // 不允许通过 PATCH 修改 status
  if ("status" in body) {
    return errorResponse(400, "invalid_input", "status cannot be changed via PATCH. Use DELETE to revoke.");
  }

  const data: Record<string, unknown> = {};

  // name
  if ("name" in body) {
    data.name = typeof body.name === "string" ? body.name : null;
  }

  // description
  if ("description" in body) {
    data.description = typeof body.description === "string" ? body.description : null;
  }

  // permissions — 合并更新
  if ("permissions" in body && typeof body.permissions === "object" && body.permissions !== null) {
    const current = (result.apiKey.permissions ?? {}) as Record<string, boolean>;
    data.permissions = { ...current, ...(body.permissions as Record<string, boolean>) };
  }

  // expiresAt
  if ("expiresAt" in body) {
    if (body.expiresAt === null) {
      data.expiresAt = null;
    } else if (typeof body.expiresAt === "string") {
      const expires = new Date(body.expiresAt);
      if (isNaN(expires.getTime())) {
        return errorResponse(400, "invalid_input", "expiresAt must be a valid ISO8601 datetime");
      }
      if (expires <= new Date()) {
        return errorResponse(400, "invalid_input", "expiresAt must be in the future");
      }
      data.expiresAt = expires;
    }
  }

  // rateLimit
  if ("rateLimit" in body) {
    if (body.rateLimit === null) {
      data.rateLimit = null;
    } else if (typeof body.rateLimit === "number" && body.rateLimit > 0) {
      data.rateLimit = body.rateLimit;
    } else {
      return errorResponse(400, "invalid_input", "rateLimit must be a positive number or null");
    }
  }

  // ipWhitelist
  if ("ipWhitelist" in body) {
    if (body.ipWhitelist === null) {
      data.ipWhitelist = null;
    } else if (Array.isArray(body.ipWhitelist)) {
      for (const ip of body.ipWhitelist) {
        if (typeof ip !== "string" || !isValidIpOrCidr(ip)) {
          return errorResponse(400, "invalid_input", `Invalid IP or CIDR: ${ip}`);
        }
      }
      data.ipWhitelist = body.ipWhitelist;
    } else {
      return errorResponse(400, "invalid_input", "ipWhitelist must be an array of IPs/CIDRs or null");
    }
  }

  if (Object.keys(data).length === 0) {
    return errorResponse(400, "invalid_input", "No valid fields to update");
  }

  const updated = await prisma.apiKey.update({
    where: { id: params.keyId },
    data,
  });

  return NextResponse.json({
    data: {
      id: updated.id,
      keyPrefix: updated.keyPrefix,
      maskedKey: `${updated.keyPrefix}...****`,
      name: updated.name,
      description: updated.description,
      status: updated.status,
      permissions: updated.permissions,
      expiresAt: updated.expiresAt,
      rateLimit: updated.rateLimit,
      ipWhitelist: updated.ipWhitelist,
      lastUsedAt: updated.lastUsedAt,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    },
  });
}

/** DELETE /api/projects/:id/keys/:keyId — 吊销 Key（不可逆） */
export async function DELETE(request: Request, { params }: Params) {
  const result = await verifyOwnership(request, params);
  if (!result.ok) return result.error;

  if (result.apiKey.status === "REVOKED") {
    return errorResponse(400, "already_revoked", "API Key is already revoked");
  }

  await prisma.apiKey.update({
    where: { id: params.keyId },
    data: { status: "REVOKED" },
  });

  return NextResponse.json({ message: "API Key revoked" });
}
