/**
 * MCP API Key 认证
 *
 * 复用 auth-middleware.ts 的核心逻辑：
 * Authorization: Bearer pk_xxx → sha256 → 查 api_keys → 关联 Project
 *
 * 新增: 过期兜底 + permissions 透传
 */

import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import type { User, ApiKey } from "@prisma/client";
import type { ApiKeyPermissions } from "@/lib/api/auth-middleware";
import { getClientIp, isIpInWhitelist } from "@/lib/api/ip-utils";

export interface McpAuthContext {
  user: User;
  projectId: string | null;
  apiKey: ApiKey;
  permissions: Partial<ApiKeyPermissions>;
}

/**
 * 从 Request 中认证 API Key，返回 project + apiKey + permissions
 * 认证失败返回 null
 */
export async function authenticateMcp(request: Request): Promise<McpAuthContext | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return null;

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer" || !parts[1]) return null;

  const rawKey = parts[1];
  const keyPrefix = rawKey.slice(0, 8);
  const keyHash = createHash("sha256").update(rawKey).digest("hex");

  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash },
    include: { user: true },
  });

  if (!apiKey || apiKey.status === "REVOKED") {
    console.warn(`[mcp] Auth failed for key prefix: ${keyPrefix}...`);
    return null;
  }

  // 过期兜底检查
  if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
    prisma.apiKey.update({ where: { id: apiKey.id }, data: { status: "REVOKED" } }).catch(() => {});
    console.warn(`[mcp] Expired key: ${keyPrefix}...`);
    return null;
  }

  // IP 白名单检查（与 auth-middleware 一致）
  const whitelist = apiKey.ipWhitelist as string[] | null;
  if (Array.isArray(whitelist)) {
    const clientIp = getClientIp(request);
    if (whitelist.length === 0 || !isIpInWhitelist(clientIp, whitelist)) {
      console.warn(`[mcp] IP ${clientIp} not in whitelist for key: ${keyPrefix}...`);
      return null;
    }
  }

  // 更新 lastUsedAt（异步，不阻塞）
  prisma.apiKey
    .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  const permissions = (apiKey.permissions ?? {}) as Partial<ApiKeyPermissions>;
  const projectId = apiKey.user.defaultProjectId;

  return { user: apiKey.user, projectId, apiKey, permissions };
}

/**
 * 检查 MCP Tool 权限
 * 返回错误消息字符串，null 表示放行
 */
export function checkMcpPermission(
  permissions: Partial<ApiKeyPermissions>,
  requiredPermission: keyof ApiKeyPermissions,
): string | null {
  // === false 才拒绝，undefined/true 放行
  if (permissions[requiredPermission] === false) {
    return `API key lacks ${requiredPermission} permission`;
  }
  return null;
}
