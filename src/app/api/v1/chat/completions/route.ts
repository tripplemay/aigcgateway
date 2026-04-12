export const dynamic = "force-dynamic";
/**
 * POST /v1/chat/completions
 *
 * 鉴权 → 余额检查 → 限流 → 路由 → adapter → 返回响应 → 异步后处理
 */

import { authenticateApiKey } from "@/lib/api/auth-middleware";
import { checkBalance } from "@/lib/api/balance-middleware";
import { checkRateLimit, rollbackRateLimit } from "@/lib/api/rate-limit";
import { errorResponse } from "@/lib/api/errors";
import { generateTraceId, jsonResponse, sseResponse } from "@/lib/api/response";
import { resolveEngine } from "@/lib/engine";
import { processChatResult } from "@/lib/api/post-process";
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

  // 4. 限流（Key 级 RPM 收紧）
  const rateCheck = await checkRateLimit(
    project ?? { id: user.defaultProjectId ?? user.id, rateLimit: null },
    "text",
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

  const startTime = Date.now();
  const modelName = body.model;

  // 6. 执行请求
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
      rlKey,
      rlMember,
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
    rlKey,
    rlMember,
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
  rlKey?: string,
  rlMember?: string,
) {
  try {
    const response = await adapter.chatCompletions(body, route);

    // 覆盖 id 和 model
    const result = {
      ...response,
      id: `chatcmpl-${traceId}`,
      model: modelName,
    };

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
      response,
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
  rlKey?: string,
  rlMember?: string,
) {
  try {
    const stream = await adapter.chatCompletionsStream(body, route);

    let fullContent = "";
    let lastUsage: Usage | null = null;
    let lastFinishReason: string | null = null;
    let ttftTime: number | undefined;

    const encoder = new TextEncoder();

    const outputStream = new ReadableStream({
      async start(controller) {
        const reader = stream.getReader();

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
          });
        } catch (err) {
          controller.error(err);

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
          });
        }
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
