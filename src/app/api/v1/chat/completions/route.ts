export const dynamic = "force-dynamic";
/**
 * POST /v1/chat/completions
 *
 * 鉴权 → 余额检查 → 限流 → 路由 → adapter → 返回响应 → 异步后处理
 */

import { authenticateApiKey } from "@/lib/api/auth-middleware";
import { checkBalance } from "@/lib/api/balance-middleware";
import {
  checkRateLimit,
  checkTokenLimit,
  checkSpendingRate,
  rollbackRateLimit,
} from "@/lib/api/rate-limit";
import { errorResponse } from "@/lib/api/errors";
import { generateTraceId, jsonResponse, sseResponse } from "@/lib/api/response";
import { resolveEngine, withFailover, getAdapterForRoute } from "@/lib/engine";
import { processChatResult, calculateTokenCost } from "@/lib/api/post-process";
import type { ChatCompletionRequest, ChatCompletionChunk, Usage } from "@/lib/engine/types";
import { EngineError, sanitizeErrorMessage } from "@/lib/engine/types";

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
  let body: ChatCompletionRequest;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "invalid_parameter", "Invalid JSON body");
  }

  if (!body.model || !body.messages?.length) {
    return errorResponse(400, "invalid_parameter", "model and messages are required", {
      param: !body.model ? "model" : "messages",
    });
  }

  // F-WP-05: every message must have non-empty string content. The MCP
  // surface enforces this via zod; the REST surface was missing the check.
  for (let i = 0; i < body.messages.length; i++) {
    const m = body.messages[i] as { role?: string; content?: unknown };
    if (typeof m.content !== "string" || m.content.length === 0) {
      return errorResponse(
        400,
        "invalid_parameter",
        `messages[${i}].content must be a non-empty string`,
        { param: `messages[${i}].content` },
      );
    }
  }

  // 4. 限流：RPM (三维度) + TPM + 消费速率
  const projectForLimits = project ?? { id: user.defaultProjectId ?? user.id, rateLimit: null };
  const rateCheck = await checkRateLimit(projectForLimits, "text", apiKey.rateLimit, {
    apiKeyId: apiKey.id,
    userId: user.id,
  });
  if (!rateCheck.ok) return rateCheck.error;
  const tpmCheck = await checkTokenLimit(projectForLimits);
  if (!tpmCheck.ok) return tpmCheck.error;
  const userRateLimit = (user.rateLimit as { spendPerMin?: number } | null) ?? null;
  const spendCheck = await checkSpendingRate(user.id, userRateLimit?.spendPerMin ?? null);
  if (!spendCheck.ok) return spendCheck.error;
  const rateLimitHeaders = rateCheck.headers;
  const rlKey = rateCheck.rateLimitKey;
  const rlMember = rateCheck.rateLimitMember;

  // 5. 路由（F-RR-02: resolveEngine now returns candidates for failover）
  let route;
  let adapter;
  let candidates: import("@/lib/engine/types").RouteResult[] = [];
  try {
    const resolved = await resolveEngine(body.model);
    route = resolved.route;
    adapter = resolved.adapter;
    candidates = resolved.candidates;
  } catch (err) {
    if (rlKey && rlMember) rollbackRateLimit(rlKey, rlMember).catch(() => {});
    if (err instanceof EngineError) {
      return errorResponse(err.statusCode, err.code, sanitizeErrorMessage(err.message));
    }
    return errorResponse(502, "provider_error", sanitizeErrorMessage((err as Error).message));
  }

  // F-DP-09: modality 校验——image 模型不允许 text chat
  if (route.alias?.modality === "IMAGE") {
    if (rlKey && rlMember) rollbackRateLimit(rlKey, rlMember).catch(() => {});
    return errorResponse(
      400,
      "invalid_model_modality",
      `Model "${body.model}" is an image generation model and cannot be used for text chat. Use /v1/images/generations instead.`,
      { param: "model" },
    );
  }

  // F-ACF-06 + F-AP-07: max_tokens upper bound — prefer maxTokens (max output),
  // fallback to contextWindow. Fail fast with 400 rather than letting the
  // upstream reject the call after we've billed its input.
  const modelContextWindow = route.model?.contextWindow ?? null;
  const modelMaxOutput = route.model?.maxTokens ?? null;
  const maxTokensLimit = modelMaxOutput ?? modelContextWindow;
  const maxTokensLimitLabel = modelMaxOutput ? "max output limit" : "context window";
  if (
    typeof body.max_tokens === "number" &&
    maxTokensLimit !== null &&
    body.max_tokens > maxTokensLimit
  ) {
    if (rlKey && rlMember) rollbackRateLimit(rlKey, rlMember).catch(() => {});
    return errorResponse(
      400,
      "invalid_parameter",
      `max_tokens (${body.max_tokens}) exceeds the ${maxTokensLimitLabel} of model "${body.model}" (${maxTokensLimit}).`,
      { param: "max_tokens" },
    );
  }

  // F-ACF-05: default max_reasoning_tokens cap for reasoning models so a tiny
  // max_tokens doesn't cause an open-ended reasoning burn.
  const modelCapabilities = (route.model?.capabilities ?? null) as { reasoning?: boolean } | null;
  if (
    modelCapabilities?.reasoning === true &&
    body.max_reasoning_tokens === undefined &&
    modelContextWindow !== null
  ) {
    body.max_reasoning_tokens = Math.min(Math.floor(modelContextWindow * 0.5), 32000);
  }

  const startTime = Date.now();
  const modelName = body.model;

  // 6. 执行请求（F-RR-02: pass candidates for failover）
  if (body.stream) {
    return handleStream(
      body,
      route,
      adapter,
      traceId,
      project?.id ?? user.defaultProjectId ?? "",
      user.id,
      modelName,
      startTime,
      rateLimitHeaders,
      request.signal,
      rlKey,
      rlMember,
      candidates,
    );
  }

  return handleNonStream(
    body,
    route,
    adapter,
    traceId,
    project?.id ?? user.defaultProjectId ?? "",
    user.id,
    modelName,
    startTime,
    rateLimitHeaders,
    request.signal,
    rlKey,
    rlMember,
    candidates,
  );
}

// ============================================================
// 非流式
// ============================================================

async function handleNonStream(
  body: ChatCompletionRequest,
  route: Awaited<ReturnType<typeof resolveEngine>>["route"],
  adapter: Awaited<ReturnType<typeof resolveEngine>>["adapter"],
  traceId: string,
  projectId: string,
  userId: string,
  modelName: string,
  startTime: number,
  rateLimitHeaders: Record<string, string>,
  clientSignal: AbortSignal,
  rlKey?: string,
  rlMember?: string,
  candidates: import("@/lib/engine/types").RouteResult[] = [],
) {
  try {
    // F-RR-02: failover — on retryable error, try next candidate channel
    const { result: response, route: usedRoute } = await withFailover(
      candidates.length > 0 ? candidates : [route],
      (r, a) => a.chatCompletions(body, r),
    );
    // Use the route that actually succeeded (may differ from initial `route` after failover)
    route = usedRoute;

    // F-AF2-09: compute cost inline for the response
    const { sellUsd } = calculateTokenCost(response.usage ?? null, route, "SUCCESS");

    // 覆盖 id 和 model, 补 cost
    const result = {
      ...response,
      id: `chatcmpl-${traceId}`,
      model: modelName,
      cost: `$${sellUsd.toFixed(8)}`,
    };

    // F-AF2-01: pass clientSignal so post-process can detect client disconnect
    processChatResult({
      traceId,
      userId,
      projectId,
      route,
      modelName,
      promptSnapshot: body.messages,
      requestParams: extractRequestParams(body),
      startTime,
      response,
      clientSignal,
    });

    return jsonResponse(result, 200, traceId, rateLimitHeaders);
  } catch (err) {
    // 请求失败 → 回滚限流计数
    if (rlKey && rlMember) rollbackRateLimit(rlKey, rlMember).catch(() => {});

    const engineErr = err instanceof EngineError ? err : null;

    processChatResult({
      traceId,
      userId,
      projectId,
      route,
      modelName,
      promptSnapshot: body.messages,
      requestParams: extractRequestParams(body),
      startTime,
      error: {
        message: (err as Error).message,
        code: engineErr?.code,
      },
      clientSignal,
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

// ============================================================
// 流式
// ============================================================

async function handleStream(
  body: ChatCompletionRequest,
  route: Awaited<ReturnType<typeof resolveEngine>>["route"],
  adapter: Awaited<ReturnType<typeof resolveEngine>>["adapter"],
  traceId: string,
  projectId: string,
  userId: string,
  modelName: string,
  startTime: number,
  rateLimitHeaders: Record<string, string>,
  clientSignal: AbortSignal,
  rlKey?: string,
  rlMember?: string,
  candidates: import("@/lib/engine/types").RouteResult[] = [],
) {
  try {
    // F-RR-02: failover for the initial stream connection. If the upstream
    // rejects before streaming starts (model_not_found, connection error),
    // we try the next candidate. Once streaming begins we're committed.
    const { result: stream, route: usedRoute } = await withFailover(
      candidates.length > 0 ? candidates : [route],
      (r, a) => a.chatCompletionsStream(body, r),
    );
    route = usedRoute;

    let fullContent = "";
    let lastUsage: Usage | null = null;
    let lastFinishReason: string | null = null;
    let ttftTime: number | undefined;

    const encoder = new TextEncoder();

    const upstreamReader = stream.getReader();
    const outputStream = new ReadableStream({
      async start(controller) {
        const reader = upstreamReader;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = value as ChatCompletionChunk;

            // 记录首 token 时间
            if (!ttftTime && chunk.choices?.[0]?.delta?.content) {
              ttftTime = Date.now();
            }

            // 累积 content
            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) fullContent += delta;

            // 记录 usage 和 finish_reason
            if (chunk.usage) lastUsage = chunk.usage;
            if (chunk.choices?.[0]?.finish_reason) {
              lastFinishReason = chunk.choices[0].finish_reason;
            }

            // 覆盖 id 和 model
            const outputChunk = {
              ...chunk,
              id: `chatcmpl-${traceId}`,
              model: modelName,
            };

            controller.enqueue(encoder.encode(`data: ${JSON.stringify(outputChunk)}\n\n`));
          }

          // 发送 [DONE]
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();

          // 异步后处理
          processChatResult({
            traceId,
            userId,
            projectId,
            route,
            modelName,
            promptSnapshot: body.messages,
            requestParams: extractRequestParams(body),
            startTime,
            ttftTime,
            streamChunks: {
              content: fullContent,
              usage: lastUsage,
              finishReason: lastFinishReason,
            },
            clientSignal,
          });
        } catch (err) {
          controller.error(err);

          // BL-INFRA-RESILIENCE H-22: release the upstream reader so the
          // provider TCP connection is returned to the pool instead of hanging
          // until the total request timeout fires.
          await reader.cancel(err).catch(() => {});

          // 流式请求失败 → 回滚限流计数
          if (rlKey && rlMember) rollbackRateLimit(rlKey, rlMember).catch(() => {});

          processChatResult({
            traceId,
            userId,
            projectId,
            route,
            modelName,
            promptSnapshot: body.messages,
            requestParams: extractRequestParams(body),
            startTime,
            ttftTime,
            error: {
              message: (err as Error).message,
            },
            clientSignal,
          });
        }
      },
      async cancel(reason) {
        // BL-INFRA-RESILIENCE H-22: propagate client-side cancel up the chain.
        // Cancelling the locked reader tells the chatCompletionsStream wrapper
        // to forward cancel upstream + clear the fetch timeout.
        await upstreamReader.cancel(reason).catch(() => {});
      },
    });

    return sseResponse(outputStream, traceId, rateLimitHeaders);
  } catch (err) {
    // 流建立失败 → 回滚限流计数
    if (rlKey && rlMember) rollbackRateLimit(rlKey, rlMember).catch(() => {});

    const engineErr = err instanceof EngineError ? err : null;

    processChatResult({
      traceId,
      userId,
      projectId,
      route,
      modelName,
      promptSnapshot: body.messages,
      requestParams: extractRequestParams(body),
      startTime,
      error: {
        message: (err as Error).message,
        code: engineErr?.code,
      },
      clientSignal,
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

// ============================================================
// 工具
// ============================================================

function extractRequestParams(body: ChatCompletionRequest): Record<string, unknown> {
  const { messages: _messages, ...params } = body;
  return params;
}
