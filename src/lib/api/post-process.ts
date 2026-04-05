/**
 * 异步后处理
 *
 * 调用完成后异步写入 CallLog + 异步执行 deduct_balance
 * 不阻塞 API 响应
 *
 * 扣费规则：
 * - SUCCESS: 全额扣（输入 + 输出 token）
 * - FILTERED: 只扣输入 token 费用
 * - ERROR / TIMEOUT: 不扣费
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { CallStatus, FinishReason } from "@prisma/client";
import type {
  RouteResult,
  Usage,
  ChatCompletionResponse,
  ImageGenerationResponse,
} from "../engine/types";
import { recordTokenUsage } from "./rate-limit";

export interface PostProcessParams {
  traceId: string;
  projectId: string;
  route: RouteResult;
  modelName: string;
  promptSnapshot: unknown[];
  requestParams: Record<string, unknown>;
  startTime: number;
  ttftTime?: number;
  source?: string; // 'api' | 'sdk' | 'mcp'
  templateId?: string;
  templateVersionId?: string;
  templateVariables?: Record<string, string>;
}

export interface ChatPostProcessParams extends PostProcessParams {
  response?: ChatCompletionResponse;
  error?: { message: string; code?: string };
  streamChunks?: { content: string; usage: Usage | null; finishReason: string | null };
}

export interface ImagePostProcessParams extends PostProcessParams {
  response?: ImageGenerationResponse;
  error?: { message: string; code?: string };
}

/**
 * 异步处理文本请求日志 + 扣费
 */
export function processChatResult(params: ChatPostProcessParams): void {
  processChatResultAsync(params).catch((err) => {
    console.error("[post-process] chat error:", err);
  });
}

/**
 * 异步处理图片请求日志 + 扣费
 */
export function processImageResult(params: ImagePostProcessParams): void {
  processImageResultAsync(params).catch((err) => {
    console.error("[post-process] image error:", err);
  });
}

// ============================================================
// 内部实现
// ============================================================

async function processChatResultAsync(params: ChatPostProcessParams): Promise<void> {
  const latencyMs = Date.now() - params.startTime;
  const isError = !!params.error;

  // 提取 usage
  const usage = params.response?.usage ?? params.streamChunks?.usage ?? null;
  const finishReasonRaw =
    params.response?.choices?.[0]?.finish_reason ??
    params.streamChunks?.finishReason ??
    (isError ? "error" : null);
  const responseContent =
    params.response?.choices?.[0]?.message?.content ?? params.streamChunks?.content ?? null;

  const status = mapCallStatus(finishReasonRaw, isError);
  const finishReason = mapFinishReason(finishReasonRaw);

  // 计算成本
  const { costUsd, sellUsd } = calculateTokenCost(usage, params.route, status);

  // 定价缺失告警：成功调用但 sellPrice 为 0，说明 channel 未配置定价
  if (status === "SUCCESS" && usage && usage.total_tokens > 0 && sellUsd === 0) {
    console.warn(
      `[post-process] WARNING: zero sell price for channel=${params.route.channel.id} model=${params.modelName} tokens=${usage.total_tokens}. Check channel sellPrice config.`,
    );
  }

  const ttftMs = params.ttftTime ? params.ttftTime - params.startTime : null;
  const tokensPerSecond =
    usage && latencyMs > 0 ? usage.completion_tokens / (latencyMs / 1000) : null;

  // 写入 CallLog
  const callLog = await prisma.callLog.create({
    data: {
      traceId: params.traceId,
      projectId: params.projectId,
      channelId: params.route.channel.id,
      modelName: params.modelName,
      promptSnapshot: params.promptSnapshot as unknown as object,
      requestParams: params.requestParams as Prisma.InputJsonValue,
      responseContent,
      finishReason,
      status,
      promptTokens: usage?.prompt_tokens ?? null,
      completionTokens: usage?.completion_tokens ?? null,
      totalTokens: usage?.total_tokens ?? null,
      costPrice: costUsd,
      sellPrice: sellUsd,
      latencyMs,
      ttftMs,
      tokensPerSecond,
      errorMessage: params.error?.message ?? null,
      errorCode: params.error?.code ?? null,
      templateId: params.templateId ?? null,
      templateVersionId: params.templateVersionId ?? null,
      templateVariables: params.templateVariables
        ? (params.templateVariables as unknown as Prisma.InputJsonValue)
        : undefined,
      source: params.source ?? "api",
    },
  });

  // 扣费（ERROR / TIMEOUT 不扣）
  if (sellUsd > 0 && (status === "SUCCESS" || status === "FILTERED")) {
    await deductBalance(params.projectId, sellUsd, callLog.id);
  }

  // 记录 TPM（用于限流检查）
  if (usage && usage.total_tokens > 0) {
    const project = await prisma.project.findUnique({
      where: { id: params.projectId },
      select: { id: true, rateLimit: true },
    });
    if (project) {
      recordTokenUsage(project, usage.total_tokens).catch(() => {});
    }
  }
}

async function processImageResultAsync(params: ImagePostProcessParams): Promise<void> {
  const latencyMs = Date.now() - params.startTime;
  const isError = !!params.error;
  const status: CallStatus = isError ? "ERROR" : "SUCCESS";

  // 图片成本：按次计价
  const { costUsd, sellUsd } = calculateCallCost(params.route, status);

  const callLog = await prisma.callLog.create({
    data: {
      traceId: params.traceId,
      projectId: params.projectId,
      channelId: params.route.channel.id,
      modelName: params.modelName,
      promptSnapshot: [{ role: "user", content: params.requestParams.prompt }] as unknown as object,
      requestParams: params.requestParams as Prisma.InputJsonValue,
      responseContent: params.response?.data?.[0]?.url ?? null,
      status,
      latencyMs,
      costPrice: costUsd,
      sellPrice: sellUsd,
      errorMessage: params.error?.message ?? null,
      errorCode: params.error?.code ?? null,
      source: params.source ?? "api",
    },
  });

  // 图片失败不扣费
  if (sellUsd > 0 && status === "SUCCESS") {
    await deductBalance(params.projectId, sellUsd, callLog.id);
  }
}

// ============================================================
// 成本计算
// ============================================================

function calculateTokenCost(
  usage: Usage | null,
  route: RouteResult,
  status: CallStatus,
): { costUsd: number; sellUsd: number } {
  if (!usage || (status !== "SUCCESS" && status !== "FILTERED")) {
    return { costUsd: 0, sellUsd: 0 };
  }

  const costPrice = route.channel.costPrice as {
    inputPer1M?: number;
    outputPer1M?: number;
    unit?: string;
  };
  const sellPrice = route.channel.sellPrice as {
    inputPer1M?: number;
    outputPer1M?: number;
    unit?: string;
  };

  const inputTokens = usage.prompt_tokens;
  // FILTERED → 只算输入 token
  const outputTokens = status === "FILTERED" ? 0 : usage.completion_tokens;

  const cnyToUsd = Number(process.env.EXCHANGE_RATE_CNY_TO_USD ?? 0.137);
  const isCny = route.config.currency === "CNY";
  const exchangeRate = isCny ? cnyToUsd : 1;

  const costUsd =
    ((inputTokens * (costPrice.inputPer1M ?? 0)) / 1_000_000 +
      (outputTokens * (costPrice.outputPer1M ?? 0)) / 1_000_000) *
    exchangeRate;

  const sellUsd =
    ((inputTokens * (sellPrice.inputPer1M ?? 0)) / 1_000_000 +
      (outputTokens * (sellPrice.outputPer1M ?? 0)) / 1_000_000) *
    exchangeRate;

  return { costUsd, sellUsd };
}

function calculateCallCost(
  route: RouteResult,
  status: CallStatus,
): { costUsd: number; sellUsd: number } {
  if (status !== "SUCCESS") return { costUsd: 0, sellUsd: 0 };

  const costPrice = route.channel.costPrice as { perCall?: number };
  const sellPrice = route.channel.sellPrice as { perCall?: number };

  const cnyToUsd = Number(process.env.EXCHANGE_RATE_CNY_TO_USD ?? 0.137);
  const isCny = route.config.currency === "CNY";
  const exchangeRate = isCny ? cnyToUsd : 1;

  return {
    costUsd: (costPrice.perCall ?? 0) * exchangeRate,
    sellUsd: (sellPrice.perCall ?? 0) * exchangeRate,
  };
}

// ============================================================
// 扣费
// ============================================================

async function deductBalance(projectId: string, amount: number, callLogId: string): Promise<void> {
  if (amount <= 0) return;

  await prisma.$queryRaw`
    SELECT * FROM deduct_balance(
      ${projectId}::TEXT,
      ${amount}::DECIMAL(12,6),
      ${callLogId}::TEXT,
      ${"API call deduction"}::TEXT
    )
  `;
}

// ============================================================
// 状态映射
// ============================================================

function mapCallStatus(finishReason: string | null, isError: boolean): CallStatus {
  if (isError) return "ERROR";
  if (finishReason === "content_filter") return "FILTERED";
  if (finishReason === "error") return "ERROR";
  if (finishReason === "timeout") return "TIMEOUT";
  return "SUCCESS";
}

function mapFinishReason(reason: string | null): FinishReason | null {
  if (!reason) return null;
  const map: Record<string, FinishReason> = {
    stop: "STOP",
    length: "LENGTH",
    content_filter: "CONTENT_FILTER",
    error: "ERROR",
    timeout: "TIMEOUT",
  };
  return map[reason] ?? null;
}
