/**
 * BL-IMG-I2I-VISION F-IIV-03 — 图片生成共享管道
 *
 * 从 /v1/images/generations route 提炼（行为不变），供 generations（JSON）与
 * edits（multipart 归一化后）两条 route 复用：
 *   校验（prompt / 源图）→ 限流 → 路由 → modality/i2i 门禁 → size 预校验 →
 *   adapter 执行（failover）→ GCS 持久化 → CallLog + 计费 → 签名代理响应。
 *
 * 鉴权 / 余额检查 / body 解析留在各 route（multipart 与 JSON 解析形态不同）。
 */

import { checkRateLimit, checkSpendingRate, rollbackRateLimit } from "@/lib/api/rate-limit";
import { errorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { resolveEngine, withFailover, getAttemptChainFromError } from "@/lib/engine";
import { processImageResult } from "@/lib/api/post-process";
import { persistGeneratedImages } from "@/lib/api/persist-image";
import { rewriteImageResponseUrls, resolveRequestOrigin } from "@/lib/api/image-proxy";
import { validatePrompt } from "@/lib/api/prompt-validation";
import { validateImageInput, sanitizeImageInputForLog } from "@/lib/api/image-input";
import type { AuthContext } from "@/lib/api/auth-middleware";
import type { ImageGenerationRequest } from "@/lib/engine/types";
import { EngineError, ErrorCodes, sanitizeErrorMessage } from "@/lib/engine/types";

export async function executeImageGeneration(
  request: Request,
  ctx: AuthContext,
  body: ImageGenerationRequest,
  traceId: string,
): Promise<Response> {
  const { user, project, apiKey } = ctx;

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

  // BL-IMG-I2I-VISION F-IIV-02 (D1): 源图（图生图）校验——归一化 string→[string]，
  // 协议白名单 / base64 大小 / 张数复用 vision-limits。网关不 fetch 源图。
  let sourceImages: string[] = [];
  if (body.image !== undefined) {
    const imageCheck = validateImageInput(body.image);
    if (!imageCheck.ok) {
      return errorResponse(400, imageCheck.error.code, imageCheck.error.message, {
        param: imageCheck.error.param,
      });
    }
    sourceImages = imageCheck.images;
    body.image = sourceImages; // 归一化为数组，adapter 侧统一按 string[] 消费
  }

  // 限流：RPM (三维度) + 消费速率（TPM 对图片不适用）
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

  // 路由（F-RR-02: candidates for failover）
  let route;
  let candidates: import("@/lib/engine/types").RouteResult[] = [];
  try {
    const resolved = await resolveEngine(body.model);
    route = resolved.route;
    candidates = resolved.candidates;
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

  // BL-IMG-I2I-VISION F-IIV-02 (D2): i2i 能力门禁——带源图时模型必须声明
  // capabilities.image_to_image=true（alias 优先，回退 model；null 按不支持）。
  // 快速 400，避免把源图透传给不支持的上游后才被拒（且已计费）。
  if (sourceImages.length > 0) {
    const aliasCaps = (route.alias?.capabilities ?? null) as { image_to_image?: boolean } | null;
    const modelCaps = (route.model?.capabilities ?? null) as { image_to_image?: boolean } | null;
    if (aliasCaps?.image_to_image !== true && modelCaps?.image_to_image !== true) {
      if (rlKey && rlMember) rollbackRateLimit(rlKey, rlMember).catch(() => {});
      return errorResponse(
        400,
        "model_not_i2i_capable",
        `Model "${body.model}" does not support image-to-image generation (source image input).`,
        { param: "model" },
      );
    }
  }

  // Size 预校验
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

  // F-IIV-02 (D6) 日志卫生：requestParams 落库前把源图替换为占位符
  // （base64 → [image:base64 NB] / URL → [image:url host]），防 call_logs 暴涨。
  const requestParamsForLog: Record<string, unknown> = {
    ...(body as unknown as Record<string, unknown>),
    ...(sourceImages.length > 0 ? { image: sanitizeImageInputForLog(sourceImages) } : {}),
  };

  // 执行请求（F-RR-02: failover on retryable errors）
  try {
    const {
      result: response,
      route: usedRoute,
      attemptChain,
    } = await withFailover(candidates.length > 0 ? candidates : [route], (r, a) =>
      a.imageGenerations(body, r),
    );
    route = usedRoute;

    const effectiveProjectId = project?.id ?? user.defaultProjectId ?? "";

    // BL-IMG-PERSIST-GCS F-IGP-02 (D4/D5): 请求路径内同步转存三形态图到 GCS，
    // 再同步 await CallLog 写入（original_urls = GCS keys），保证响应返回前
    // 代理回源已可解析（关闭 fire-and-forget 竞态）。存储故障 → keys 含 null，
    // 按 D6 兜底，生成不硬失败。
    const persistedKeys = await persistGeneratedImages(traceId, effectiveProjectId, response);

    // F-AF2-01: pass clientSignal for disconnect detection
    await processImageResult({
      traceId,
      userId: user.id,
      projectId: effectiveProjectId,
      route,
      modelName,
      promptSnapshot: [{ role: "user", content: body.prompt }],
      requestParams: requestParamsForLog,
      sourceImagesCount: sourceImages.length > 0 ? sourceImages.length : undefined,
      startTime,
      response,
      persistedKeys,
      clientSignal: request.signal,
      attemptChain,
    });

    // F-ACF-07 + F-IGP-03: persisted images (incl. data:/b64_json) get a proxy
    // URL that reads back from GCS; `b64_json` is left intact (D7). Non-persisted
    // indices fall back to legacy behaviour (http→proxy, data:→verbatim).
    // fix_round 1: derive public origin from forwarded headers — request.url
    // resolves to the internal 0.0.0.0:3000 bind under Next standalone.
    const origin = resolveRequestOrigin(request);
    const proxied = rewriteImageResponseUrls(response, traceId, origin, persistedKeys);

    return jsonResponse(proxied, 200, traceId, rateLimitHeaders);
  } catch (err) {
    // 请求失败 → 回滚限流计数
    if (rlKey && rlMember) rollbackRateLimit(rlKey, rlMember).catch(() => {});

    const engineErr = err instanceof EngineError ? err : null;
    const failedChain = getAttemptChainFromError(err) ?? undefined;

    processImageResult({
      traceId,
      userId: user.id,
      projectId: project?.id ?? user.defaultProjectId ?? "",
      route,
      modelName,
      promptSnapshot: [{ role: "user", content: body.prompt }],
      requestParams: requestParamsForLog,
      sourceImagesCount: sourceImages.length > 0 ? sourceImages.length : undefined,
      startTime,
      error: {
        message: (err as Error).message,
        code: engineErr?.code,
      },
      clientSignal: request.signal,
      attemptChain: failedChain,
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
