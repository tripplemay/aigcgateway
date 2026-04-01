/**
 * API Key 鉴权中间件
 *
 * Authorization: Bearer pk_xxx → sha256 → 查 api_keys.keyHash → 关联 Project
 *
 * 鉴权流程:
 * 1. 解析 API Key → 查库
 * 2. 状态检查（REVOKED?）
 * 3. 过期兜底检查（expiresAt）
 * 4. 权限检查（permissions, === false 才拒绝）
 * 5. IP 白名单检查（ipWhitelist）
 * 6. 更新 lastUsedAt
 */

import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import type { Project, ApiKey } from "@prisma/client";
import { errorResponse } from "./errors";
import { getClientIp, isIpInWhitelist } from "./ip-utils";
import type { NextResponse } from "next/server";

export interface ApiKeyPermissions {
  chatCompletion?: boolean;
  imageGeneration?: boolean;
  logAccess?: boolean;
  projectInfo?: boolean;
}

export interface AuthContext {
  project: Project;
  apiKey: ApiKey;
}

type AuthResult =
  | { ok: true; ctx: AuthContext }
  | { ok: false; error: NextResponse };

type Endpoint = "chat" | "image" | "log" | "model" | "unknown";

/** 从请求路径推断 endpoint 类型 */
function detectEndpoint(request: Request): Endpoint {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path.includes("/chat/completions")) return "chat";
  if (path.includes("/images/generations")) return "image";
  if (path.includes("/models")) return "model";
  return "unknown";
}

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

  // 过期兜底检查（定时任务是主力，这里是兜底）
  if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
    prisma.apiKey
      .update({ where: { id: apiKey.id }, data: { status: "REVOKED" } })
      .catch(() => {});
    return {
      ok: false,
      error: errorResponse(401, "invalid_api_key", "API key has expired"),
    };
  }

  // 权限检查 — === false 才拒绝，undefined/true 放行
  const permissions = (apiKey.permissions ?? {}) as Partial<ApiKeyPermissions>;
  const endpoint = detectEndpoint(request);

  if (endpoint === "chat" && permissions.chatCompletion === false) {
    return { ok: false, error: errorResponse(403, "forbidden", "API key lacks chatCompletion permission") };
  }
  if (endpoint === "image" && permissions.imageGeneration === false) {
    return { ok: false, error: errorResponse(403, "forbidden", "API key lacks imageGeneration permission") };
  }
  if (endpoint === "model" && permissions.projectInfo === false) {
    return { ok: false, error: errorResponse(403, "forbidden", "API key lacks projectInfo permission") };
  }

  // IP 白名单检查
  const whitelist = apiKey.ipWhitelist as string[] | null;
  if (whitelist && whitelist.length > 0) {
    const clientIp = getClientIp(request);
    if (!isIpInWhitelist(clientIp, whitelist)) {
      return {
        ok: false,
        error: errorResponse(403, "forbidden", `Request IP ${clientIp} not in whitelist`),
      };
    }
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
