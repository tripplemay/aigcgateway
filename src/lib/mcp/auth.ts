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
import { API_KEY_PERMISSION_KEYS, type ApiKeyPermissions } from "@/lib/api/auth-middleware";
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

  // IP 白名单检查 — 与 auth-middleware.ts:143-158 语义显式对齐（F-IG-04）。
  // 空数组 → 明确 block（"all requests blocked"），非空 → 严格匹配。
  const whitelist = apiKey.ipWhitelist as string[] | null;
  if (Array.isArray(whitelist)) {
    if (whitelist.length === 0) {
      console.warn(`[mcp] Empty IP whitelist on key ${keyPrefix}... — all requests blocked`);
      return null;
    }
    const clientIp = getClientIp(request);
    if (!isIpInWhitelist(clientIp, whitelist)) {
      console.warn(`[mcp] IP ${clientIp} not in whitelist for key: ${keyPrefix}...`);
      return null;
    }
  }

  // 更新 lastUsedAt（异步，不阻塞）
  prisma.apiKey
    .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  const permissions = (apiKey.permissions ?? {}) as Partial<ApiKeyPermissions>;

  // 校验 defaultProjectId 对应的项目是否存在
  let projectId = apiKey.user.defaultProjectId;
  if (projectId) {
    const projectExists = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!projectExists) {
      // defaultProject 不存在，fallback 到用户第一个可用项目
      const fallback = await prisma.project.findFirst({
        where: { userId: apiKey.user.id },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      projectId = fallback?.id ?? null;
    }
  } else {
    // defaultProjectId 为 null，尝试 fallback
    const fallback = await prisma.project.findFirst({
      where: { userId: apiKey.user.id },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    projectId = fallback?.id ?? null;
  }

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

/**
 * BL-SEC-HOTFIX-2608 F-SH-05（审查 C5）— 计算「由某把 Key 创建出的新 Key」应有的权限。
 *
 * MCP create_api_key 原先硬编码 `permissions: {}`。由于 checkMcpPermission 只在
 * `=== false` 时拒绝，空对象等价于**全部权限**——于是一把只有 keyManagement、
 * 其余全 false 的受限 Key，可以铸造出一把能 chat、能生成图片、能读日志的全权限
 * Key，彻底突破原 Key 的权限边界。
 *
 * 这里按该三态模型取交集：调用方显式为 false 的位，新 Key 必须也是 false；
 * 其余保持 undefined（沿用「未声明即放行」的既有语义），使全权限 Key 创建新 Key
 * 的行为与从前一致。
 */
export function derivePermissionsForNewKey(
  callerPermissions: Partial<ApiKeyPermissions>,
): Partial<ApiKeyPermissions> {
  const derived: Partial<ApiKeyPermissions> = {};
  for (const key of API_KEY_PERMISSION_KEYS) {
    if (callerPermissions[key] === false) derived[key] = false;
  }
  return derived;
}
