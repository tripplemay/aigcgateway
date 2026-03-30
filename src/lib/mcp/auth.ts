/**
 * MCP API Key 认证
 *
 * 复用 auth-middleware.ts 的核心逻辑：
 * Authorization: Bearer pk_xxx → sha256 → 查 api_keys → 关联 Project
 */

import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import type { Project, ApiKey } from "@prisma/client";

export interface McpAuthContext {
  project: Project;
  apiKey: ApiKey;
}

/**
 * 从 Request 中认证 API Key，返回 project + apiKey
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
    include: { project: true },
  });

  if (!apiKey || apiKey.status === "REVOKED") {
    console.warn(`[mcp] Auth failed for key prefix: ${keyPrefix}...`);
    return null;
  }

  // 更新 lastUsedAt（异步，不阻塞）
  prisma.apiKey
    .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return { project: apiKey.project, apiKey };
}
