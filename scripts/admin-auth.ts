/**
 * 管理端统一鉴权测试入口脚本
 *
 * 用法：
 *   BASE_URL=https://aigc.guangai.ai npx tsx scripts/admin-auth.ts
 *
 * 高频管理接口 curl 等价示例（将 $TOKEN 替换为实际 JWT）：
 *
 *   # 通道+模型列表
 *   curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/admin/models-channels"
 *
 *   # 同步状态
 *   curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/admin/sync-status"
 *
 *   # 触发同步
 *   curl -s -X POST -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/admin/sync-models"
 *
 *   # 健康检查状态
 *   curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/admin/health"
 *
 *   # 用量统计
 *   curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/admin/usage?from=2026-04-01T00:00:00Z&to=2026-04-06T00:00:00Z"
 */

import { requireEnv } from "./lib/require-env";

const DEFAULT_BASE_URL = "http://localhost:3099";
const ADMIN_EMAIL = "codex-admin@aigc-gateway.local";
const ADMIN_PASSWORD = requireEnv("ADMIN_TEST_PASSWORD");

export async function getAdminToken(baseUrl?: string): Promise<string> {
  const base = baseUrl ?? process.env.BASE_URL ?? DEFAULT_BASE_URL;
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Login failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return data.token as string;
}

export async function getAdminHeaders(baseUrl?: string): Promise<Record<string, string>> {
  const token = await getAdminToken(baseUrl);
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

// 独立运行时打印 token 前 20 字符
const isMain =
  typeof process !== "undefined" && process.argv[1] && process.argv[1].includes("admin-auth");

if (isMain) {
  getAdminToken()
    .then((token) => {
      console.log(`Admin token (first 20 chars): ${token.substring(0, 20)}...`);
    })
    .catch((err) => {
      console.error("Failed to get admin token:", err.message);
      process.exit(1);
    });
}
