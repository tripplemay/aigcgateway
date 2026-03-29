/**
 * API Key 鉴权中间件
 *
 * Authorization: Bearer pk_xxx → sha256 → 查 api_keys.keyHash → 关联 Project
 */

import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import type { Project, ApiKey } from "@prisma/client";
import { errorResponse } from "./errors";
import type { NextResponse } from "next/server";


export interface AuthContext {
  project: Project;
  apiKey: ApiKey;
}

type AuthResult =
  | { ok: true; ctx: AuthContext }
  | { ok: false; error: NextResponse };

export async function authenticateApiKey(
  request: Request,
): Promise<AuthResult> {
  const authHeader = request.headers.get("authorization");

  if (!authHeader) {
    return {
      ok: false,
      error: errorResponse(401, "invalid_api_key", "Missing Authorization header"),
    };
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer" || !parts[1]) {
    return {
      ok: false,
      error: errorResponse(401, "invalid_api_key", "Invalid Authorization format. Expected: Bearer <api_key>"),
    };
  }

  const rawKey = parts[1];
  const keyHash = createHash("sha256").update(rawKey).digest("hex");

  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash },
    include: { project: true },
  });

  if (!apiKey) {
    return {
      ok: false,
      error: errorResponse(401, "invalid_api_key", "Invalid API key"),
    };
  }

  if (apiKey.status === "REVOKED") {
    return {
      ok: false,
      error: errorResponse(401, "invalid_api_key", "API key has been revoked"),
    };
  }

  // 更新 lastUsedAt（异步，不阻塞）
  prisma.apiKey
    .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return {
    ok: true,
    ctx: { project: apiKey.project, apiKey },
  };
}
