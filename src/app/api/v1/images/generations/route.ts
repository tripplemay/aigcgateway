export const dynamic = "force-dynamic";
/**
 * POST /v1/images/generations
 *
 * 鉴权 → 余额检查 → 限流(图片RPM) → 路由 → adapter → 响应 → 异步后处理
 */

import { authenticateApiKey } from "@/lib/api/auth-middleware";
import { checkBalance } from "@/lib/api/balance-middleware";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { errorResponse } from "@/lib/api/errors";
import { generateTraceId, jsonResponse } from "@/lib/api/response";
import { resolveEngine } from "@/lib/engine";
import { processImageResult } from "@/lib/api/post-process";
import type { ImageGenerationRequest } from "@/lib/engine/types";
import { EngineError } from "@/lib/engine/types";

export async function POST(request: Request) {
  const traceId = generateTraceId();

  // 1. 鉴权
  const auth = await authenticateApiKey(request);
  if (!auth.ok) return auth.error;
  const { project, apiKey } = auth.ctx;

  // 2. 余额检查
  const balanceCheck = checkBalance(project);
  if (!balanceCheck.ok) return balanceCheck.error;

  // 3. 解析请求体
  let body: ImageGenerationRequest;
  try {
    body = (await request.json()) as ImageGenerationRequest;
  } catch {
    return errorResponse(400, "invalid_parameter", "Invalid JSON body");
  }

  if (!body.model || !body.prompt) {
    return errorResponse(400, "invalid_parameter", "model and prompt are required", {
      param: !body.model ? "model" : "prompt",
    });
  }

  // 4. 限流（Key 级 RPM 收紧）
  const rateCheck = await checkRateLimit(project, "image", apiKey.rateLimit);
  if (!rateCheck.ok) return rateCheck.error;
  const rateLimitHeaders = rateCheck.headers;

  // 5. 路由
  let route;
  let adapter;
  try {
    const resolved = await resolveEngine(body.model);
    route = resolved.route;
    adapter = resolved.adapter;
  } catch (err) {
    if (err instanceof EngineError) {
      return errorResponse(err.statusCode, err.code, err.message);
    }
    return errorResponse(502, "provider_error", (err as Error).message);
  }

  const startTime = Date.now();
  const modelName = body.model;

  // 6. 执行请求
  try {
    const response = await adapter.imageGenerations(body, route);

    // 异步后处理
    processImageResult({
      traceId,
      projectId: project.id,
      route,
      modelName,
      promptSnapshot: [{ role: "user", content: body.prompt }],
      requestParams: body as unknown as Record<string, unknown>,
      startTime,
      response,
    });

    return jsonResponse(response, 200, traceId, rateLimitHeaders);
  } catch (err) {
    const engineErr = err instanceof EngineError ? err : null;

    processImageResult({
      traceId,
      projectId: project.id,
      route,
      modelName,
      promptSnapshot: [{ role: "user", content: body.prompt }],
      requestParams: body as unknown as Record<string, unknown>,
      startTime,
      error: {
        message: (err as Error).message,
        code: engineErr?.code,
      },
    });

    if (engineErr) {
      return errorResponse(engineErr.statusCode, engineErr.code, engineErr.message);
    }
    return errorResponse(502, "provider_error", (err as Error).message);
  }
}
