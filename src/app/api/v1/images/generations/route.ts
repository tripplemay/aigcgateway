export const dynamic = "force-dynamic";
/**
 * POST /v1/images/generations
 *
 * 鉴权 → 余额检查 → 限流(图片RPM) → 路由 → adapter → 响应 → 异步后处理
 */

import { authenticateApiKey } from "@/lib/api/auth-middleware";
import { checkBalance } from "@/lib/api/balance-middleware";
import { checkRateLimit, checkSpendingRate, rollbackRateLimit } from "@/lib/api/rate-limit";
import { errorResponse } from "@/lib/api/errors";
import { generateTraceId, jsonResponse } from "@/lib/api/response";
import { resolveEngine } from "@/lib/engine";
import { processImageResult } from "@/lib/api/post-process";
import { buildProxyUrl } from "@/lib/api/image-proxy";
import { validatePrompt } from "@/lib/api/prompt-validation";
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

  // F-WP-05: reject empty / oversized / binary prompts before routing.
  const promptCheck = validatePrompt(String(body.prompt), { maxLength: 4000 });
  if (!promptCheck.ok) {
    return errorResponse(400, "invalid_prompt", promptCheck.message ?? "invalid prompt", {
      param: "prompt",
    });
  }

  // 4. 限流：RPM (三维度) + 消费速率（TPM 对图片不适用）
  const projectForLimits = project ?? { id: user.defaultProjectId ?? user.id, rateLimit: null };
  const rateCheck = await checkRateLimit(projectForLimits, "image", apiKey.rateLimit, {
    apiKeyId: apiKey.id,
    userId: user.id,
  });
  if (!rateCheck.ok) return rateCheck.error;
  const userRateLimit = (user.rateLimit as { spendPerMin?: number } | null) ?? null;
  const spendCheck = await checkSpendingRate(user.id, userRateLimit?.spendPerMin ?? null);
  if (!spendCheck.ok) return spendCheck.error;
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

  // F-ACF-11: modality 校验——text 模型不允许用于图片生成
  if (route.alias?.modality === "TEXT") {
    if (rlKey && rlMember) rollbackRateLimit(rlKey, rlMember).catch(() => {});
    return errorResponse(
      400,
      "invalid_model_modality",
      `Model "${body.model}" is a text model and cannot be used for image generation. Use the chat tool instead.`,
      { param: "model" },
    );
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

    // F-AF2-01: pass clientSignal for disconnect detection
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
      clientSignal: request.signal,
    });

    // F-ACF-07: rewrite each upstream URL into a signed proxy URL so callers
    // never see bizyair/aliyuncs/ComfyUI/openai.com hostnames.
    const origin = new URL(request.url).origin;
    const proxied = {
      ...response,
      data: (response.data ?? []).map((d, i) => ({
        ...d,
        url: d?.url ? buildProxyUrl(traceId, i, origin) : d?.url,
      })),
    };

    return jsonResponse(proxied, 200, traceId, rateLimitHeaders);
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
      clientSignal: request.signal,
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
