export const dynamic = "force-dynamic";
/**
 * POST /v1/images/generations
 *
 * 鉴权 → 余额检查 → 限流(图片RPM) → 路由 → adapter → 响应 → 异步后处理
 */

import { authenticateApiKey } from "@/lib/api/auth-middleware";
import { checkBalance } from "@/lib/api/balance-middleware";
import { checkRateLimit, rollbackRateLimit } from "@/lib/api/rate-limit";
import { errorResponse } from "@/lib/api/errors";
import { generateTraceId, jsonResponse } from "@/lib/api/response";
import { resolveEngine } from "@/lib/engine";
import { processImageResult } from "@/lib/api/post-process";
import type { ImageGenerationRequest } from "@/lib/engine/types";
import { EngineError, ErrorCodes, sanitizeErrorMessage } from "@/lib/engine/types";

export async function POST(request: Request) {
  const traceId = generateTraceId();

  // 1. 鉴权
  const auth = await authenticateApiKey(request);
  if (!auth.ok) return auth.error;
  const { user, project, apiKey } = auth.ctx;

  // 2. 余额检查
  const balanceCheck = checkBalance(user);
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
  const rateCheck = await checkRateLimit(
    project ?? { id: user.defaultProjectId ?? user.id, rateLimit: null },
    "image",
    apiKey.rateLimit,
  );
  if (!rateCheck.ok) return rateCheck.error;
  const rateLimitHeaders = rateCheck.headers;
  const rlKey = rateCheck.rateLimitKey;
  const rlMember = rateCheck.rateLimitMember;

  // 5. 路由
  let route;
  let adapter;
  try {
    const resolved = await resolveEngine(body.model);
    route = resolved.route;
    adapter = resolved.adapter;
  } catch (err) {
    if (rlKey && rlMember) rollbackRateLimit(rlKey, rlMember).catch(() => {});
    if (err instanceof EngineError) {
      return errorResponse(err.statusCode, err.code, sanitizeErrorMessage(err.message));
    }
    return errorResponse(502, "provider_error", sanitizeErrorMessage((err as Error).message));
  }

  // 5.5 Size 预校验
  if (body.size) {
    const supportedSizes = route.model.supportedSizes as string[] | null;
    if (supportedSizes && supportedSizes.length > 0 && !supportedSizes.includes(body.size)) {
      if (rlKey && rlMember) rollbackRateLimit(rlKey, rlMember).catch(() => {});
      return errorResponse(
        400,
        ErrorCodes.INVALID_SIZE,
        `Invalid size "${body.size}" for model "${body.model}". Supported sizes: ${supportedSizes.join(", ")}`,
        { param: "size" },
      );
    }
  }

  const startTime = Date.now();
  const modelName = body.model;

  // 6. 执行请求
  try {
    const response = await adapter.imageGenerations(body, route);

    // 异步后处理
    processImageResult({
      traceId,
      userId: user.id,
      projectId: project?.id ?? user.defaultProjectId ?? "",
      route,
      modelName,
      promptSnapshot: [{ role: "user", content: body.prompt }],
      requestParams: body as unknown as Record<string, unknown>,
      startTime,
      response,
    });

    return jsonResponse(response, 200, traceId, rateLimitHeaders);
  } catch (err) {
    // 请求失败 → 回滚限流计数
    if (rlKey && rlMember) rollbackRateLimit(rlKey, rlMember).catch(() => {});

    const engineErr = err instanceof EngineError ? err : null;

    processImageResult({
      traceId,
      userId: user.id,
      projectId: project?.id ?? user.defaultProjectId ?? "",
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
      return errorResponse(
        engineErr.statusCode,
        engineErr.code,
        sanitizeErrorMessage(engineErr.message),
      );
    }
    return errorResponse(502, "provider_error", sanitizeErrorMessage((err as Error).message));
  }
}
