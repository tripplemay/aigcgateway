export const dynamic = "force-dynamic";
/**
 * POST /v1/images/generations
 *
 * 鉴权 → 余额检查 → JSON body 解析 → 共享管道（image-generation-core）
 * F-IIV-03: 校验/限流/路由/门禁/执行/计费/持久化/日志提炼至
 * executeImageGeneration，与 /v1/images/edits 复用。
 */

import { authenticateApiKey } from "@/lib/api/auth-middleware";
import { checkBalance } from "@/lib/api/balance-middleware";
import { errorResponse } from "@/lib/api/errors";
import { generateTraceId } from "@/lib/api/response";
import { executeImageGeneration } from "@/lib/api/image-generation-core";
import type { ImageGenerationRequest } from "@/lib/engine/types";

export async function POST(request: Request) {
  const traceId = generateTraceId();

  // 1. 鉴权
  const auth = await authenticateApiKey(request);
  if (!auth.ok) return auth.error;

  // 2. 余额检查
  const balanceCheck = checkBalance(auth.ctx.user);
  if (!balanceCheck.ok) return balanceCheck.error;

  // 3. 解析请求体
  let body: ImageGenerationRequest;
  try {
    body = (await request.json()) as ImageGenerationRequest;
  } catch {
    return errorResponse(400, "invalid_parameter", "Invalid JSON body");
  }

  // 4. 共享管道：校验 → 限流 → 路由 → 门禁 → 执行 → 计费/日志 → 响应
  return executeImageGeneration(request, auth.ctx, body, traceId);
}
