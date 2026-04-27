export const dynamic = "force-dynamic";
/**
 * POST /v1/embeddings — BL-EMBEDDING-MVP F-EM-02
 *
 * 镜像 /v1/chat/completions 鉴权/限流/路由，但：
 *   - 不走 stream
 *   - modality 校验：必须是 EMBEDDING 模型，否则 400
 *   - 不调 chatCompletions / chatCompletionsStream，调 adapter.embeddings
 *   - 计费走 processEmbeddingResult（input tokens 单边）
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
import { generateTraceId, jsonResponse } from "@/lib/api/response";
import { resolveEngine } from "@/lib/engine";
import { processEmbeddingResult, calculateTokenCost } from "@/lib/api/post-process";
import type { EmbeddingRequest, Usage } from "@/lib/engine/types";
import { EngineError, sanitizeErrorMessage } from "@/lib/engine/types";

const MAX_BATCH_INPUTS = 100;

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
  let body: EmbeddingRequest;
  try {
    body = (await request.json()) as EmbeddingRequest;
  } catch {
    return errorResponse(400, "invalid_parameter", "Invalid JSON body");
  }

  if (!body.model) {
    return errorResponse(400, "invalid_parameter", "model is required", { param: "model" });
  }

  // input 必填且非空：可以是 string 或 string[]
  if (body.input === undefined || body.input === null) {
    return errorResponse(400, "invalid_parameter", "input is required", { param: "input" });
  }

  if (typeof body.input === "string") {
    if (body.input.length === 0) {
      return errorResponse(400, "invalid_parameter", "input must not be empty", {
        param: "input",
      });
    }
  } else if (Array.isArray(body.input)) {
    if (body.input.length === 0) {
      return errorResponse(400, "invalid_parameter", "input array must not be empty", {
        param: "input",
      });
    }
    if (body.input.length > MAX_BATCH_INPUTS) {
      return errorResponse(
        400,
        "invalid_parameter",
        `input array must contain at most ${MAX_BATCH_INPUTS} items`,
        { param: "input" },
      );
    }
    for (let i = 0; i < body.input.length; i++) {
      const item = body.input[i];
      if (typeof item !== "string" || item.length === 0) {
        return errorResponse(
          400,
          "invalid_parameter",
          `input[${i}] must be a non-empty string`,
          { param: `input[${i}]` },
        );
      }
    }
  } else {
    return errorResponse(
      400,
      "invalid_parameter",
      "input must be a string or array of strings",
      { param: "input" },
    );
  }

  // 4. 限流：'text' 维度复用（rpm 已有）；TPM + spending 同 chat
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

  // 6. modality 校验：必须 EMBEDDING（与 chat 路径相反，chat 是排除 IMAGE）
  if (route.model?.modality !== "EMBEDDING") {
    if (rlKey && rlMember) rollbackRateLimit(rlKey, rlMember).catch(() => {});
    return errorResponse(
      400,
      "invalid_model_modality",
      `Model "${body.model}" is not an embedding model. Use list_models?modality=embedding to discover embedding models.`,
      { param: "model" },
    );
  }

  // 7. adapter 必须实现 embeddings()
  if (!adapter.embeddings) {
    if (rlKey && rlMember) rollbackRateLimit(rlKey, rlMember).catch(() => {});
    return errorResponse(
      502,
      "provider_error",
      `Provider does not support embeddings`,
    );
  }

  const startTime = Date.now();
  const modelName = body.model;
  const projectId = project?.id ?? user.defaultProjectId ?? "";

  try {
    const response = await adapter.embeddings(body, route);

    // 内联计算 sellUsd 用于响应（mirror chat completion 的 cost 字段）
    const usageForCost: Usage = {
      prompt_tokens: response.usage.prompt_tokens,
      completion_tokens: 0,
      total_tokens: response.usage.total_tokens,
    };
    const { sellUsd } = calculateTokenCost(usageForCost, route, "SUCCESS");

    // 覆盖 model 名（透传客户端请求的 canonical name，而非 upstream realModelId）
    const result = {
      ...response,
      model: modelName,
      cost: `$${sellUsd.toFixed(8)}`,
    };

    processEmbeddingResult({
      traceId,
      userId: user.id,
      projectId,
      route,
      modelName,
      promptSnapshot: [
        // 单条 input 存为 user message；批量 input 存数组（与 chat completions 风格不同但语义清晰）
        typeof body.input === "string"
          ? { role: "user", content: body.input.slice(0, 4000) }
          : { role: "user", content: body.input.map((s) => s.slice(0, 1000)).join("\n---\n").slice(0, 4000) },
      ],
      requestParams: {
        model: body.model,
        input_type: typeof body.input === "string" ? "single" : "batch",
        input_count: typeof body.input === "string" ? 1 : body.input.length,
        ...(body.encoding_format ? { encoding_format: body.encoding_format } : {}),
      },
      startTime,
      response,
    });

    return jsonResponse(result, 200, traceId, rateLimitHeaders);
  } catch (err) {
    if (rlKey && rlMember) rollbackRateLimit(rlKey, rlMember).catch(() => {});

    const engineErr = err instanceof EngineError ? err : null;

    processEmbeddingResult({
      traceId,
      userId: user.id,
      projectId,
      route,
      modelName,
      promptSnapshot: [
        typeof body.input === "string"
          ? { role: "user", content: body.input.slice(0, 4000) }
          : { role: "user", content: "(batch)" },
      ],
      requestParams: {
        model: body.model,
        input_type: typeof body.input === "string" ? "single" : "batch",
        input_count: typeof body.input === "string" ? 1 : body.input.length,
      },
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
