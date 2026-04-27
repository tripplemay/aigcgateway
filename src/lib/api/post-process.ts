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
import {
  sanitizeErrorMessage,
  type RouteResult,
  type Usage,
  type ChatCompletionResponse,
  type EmbeddingResponse,
  type ImageGenerationResponse,
} from "../engine/types";
import type { AttemptRecord } from "../engine/failover";
import { recordTokenUsage, recordSpending } from "./rate-limit";
import { checkAndSendBalanceLowAlert } from "@/lib/notifications/triggers";

export interface PostProcessParams {
  traceId: string;
  userId: string;
  projectId: string;
  route: RouteResult;
  modelName: string;
  promptSnapshot: unknown[];
  requestParams: Record<string, unknown>;
  startTime: number;
  ttftTime?: number;
  source?: string; // 'api' | 'mcp'
  actionId?: string;
  actionVersionId?: string;
  templateRunId?: string;
  /** HTTP request abort signal — used to detect client disconnect before billing */
  clientSignal?: AbortSignal;
  /**
   * BL-BILLING-AUDIT-EXT-P1 F-BAX-04: withFailover 返回的尝试链，写入
   * responseSummary.attempt_chain 供审计使用。消除"call_logs.channelId 与
   * errorMessage 错位"（旧逻辑 errorMessage 保留了首个失败 channel 的信息，
   * 但 channelId 却是最终成功/最后失败 channel）。
   */
  attemptChain?: AttemptRecord[];
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
 * BL-EMBEDDING-MVP F-EM-02: embedding 后处理参数。usage 仅含 prompt_tokens
 * （embedding 无 completion）；computed cost via calculateTokenCost(usage,
 * route, status) where usage.completion_tokens=0 → output 项乘 0 = 0。
 */
export interface EmbeddingPostProcessParams extends PostProcessParams {
  response?: EmbeddingResponse;
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

// ============================================================
// BL-BILLING-AUDIT-EXT-P1 F-BAX-02: probe / admin_health 写 call_log
// ============================================================
//
// health probe（scheduler + admin）也会发真实 chat/image 请求，之前只写
// health_checks，不写 call_logs —— 对上游是有计费的调用，对内部审计是
// 黑洞。这里补上 call_log 写入（projectId=null，不 deduct，不 checkBalance），
// source='probe' | 'admin_health' 与正常业务流量区分。

export interface ProbeCallLogParams {
  traceId: string;
  route: RouteResult;
  source: "probe" | "admin_health";
  startTime: number;
  response?: ChatCompletionResponse | ImageGenerationResponse;
  error?: { message: string; code?: string };
  isImage: boolean;
}

export function writeProbeCallLog(params: ProbeCallLogParams): void {
  writeProbeCallLogAsync(params).catch((err) => {
    console.error("[post-process] probe call_log write error:", err);
  });
}

// ============================================================
// BL-BILLING-AUDIT-EXT-P1 F-BAX-03: sync 工具调用 LLM 写 call_log
// ============================================================
//
// Category D 盲区修复：alias-classifier / doc-enricher 原来直接 fetch
// deepseek-chat，绕过 engine 层，call_logs 与 health_checks 都没记录。
// 改用 adapter + withFailover 后，成功调用通过此 helper 写 call_log，
// source='sync' 用于区分。projectId=null，不扣费，不告警。

export interface SyncCallLogParams {
  traceId: string;
  route: RouteResult;
  taskName: string;
  startTime: number;
  prompt: string;
  response: ChatCompletionResponse;
}

export function writeSyncCallLog(params: SyncCallLogParams): void {
  writeSyncCallLogAsync(params).catch((err) => {
    console.error("[post-process] sync call_log write error:", err);
  });
}

async function writeSyncCallLogAsync(params: SyncCallLogParams): Promise<void> {
  const latencyMs = Date.now() - params.startTime;
  const usage = params.response.usage ?? null;
  const ok = !!params.response.choices?.length;
  const status: CallStatus = ok ? "SUCCESS" : "FILTERED";
  const finishReason = mapFinishReason(params.response.choices?.[0]?.finish_reason ?? null);
  const { costUsd, sellUsd } = calculateTokenCost(usage, params.route, status);

  await prisma.callLog.create({
    data: {
      traceId: params.traceId,
      projectId: null,
      channelId: params.route.channel.id,
      modelName: params.route.model.name,
      // prompt 可能很长（classifier prompt 数 KB），截断存入 snapshot
      promptSnapshot: [
        { role: "user", content: params.prompt.slice(0, 4000) },
      ] as unknown as object,
      requestParams: { taskName: params.taskName, model: params.route.model.name },
      responseContent: params.response.choices?.[0]?.message?.content ?? null,
      finishReason,
      status,
      promptTokens: usage?.prompt_tokens ?? null,
      completionTokens: usage?.completion_tokens ?? null,
      totalTokens: usage?.total_tokens ?? null,
      costPrice: costUsd,
      sellPrice: sellUsd,
      latencyMs,
      source: "sync",
    },
  });
}

async function writeProbeCallLogAsync(params: ProbeCallLogParams): Promise<void> {
  const latencyMs = Date.now() - params.startTime;
  const isError = !!params.error;

  let status: CallStatus;
  let finishReason: FinishReason | null = null;
  let responseContent: string | null = null;
  let usage: Usage | null = null;
  let imagesCount = 0;

  if (isError) {
    status = "ERROR";
    finishReason = "ERROR";
  } else if (params.isImage) {
    const imgRes = params.response as ImageGenerationResponse | undefined;
    imagesCount = imgRes?.data?.length ?? 0;
    status = imagesCount > 0 ? "SUCCESS" : "FILTERED";
    responseContent = imgRes?.data?.[0]?.url ?? null;
  } else {
    const chatRes = params.response as ChatCompletionResponse | undefined;
    usage = chatRes?.usage ?? null;
    const reason = chatRes?.choices?.[0]?.finish_reason ?? null;
    status = chatRes?.choices?.length ? "SUCCESS" : "FILTERED";
    finishReason = mapFinishReason(reason);
    responseContent = chatRes?.choices?.[0]?.message?.content ?? null;
  }

  const { costUsd, sellUsd } = params.isImage
    ? calculateCallCost(params.route, status)
    : calculateTokenCost(usage, params.route, status);

  const responseSummary: Prisma.InputJsonValue | undefined = params.isImage
    ? { images_count: imagesCount }
    : undefined;

  const promptSnapshot = params.isImage
    ? ([{ role: "user", content: "probe: a dot" }] as unknown as object)
    : ([{ role: "user", content: "hi" }] as unknown as object);

  await prisma.callLog.create({
    data: {
      traceId: params.traceId,
      projectId: null,
      channelId: params.route.channel.id,
      modelName: params.route.model.name,
      promptSnapshot,
      requestParams: params.isImage
        ? { model: params.route.model.name, prompt: "a dot" }
        : {
            model: params.route.model.name,
            messages: [{ role: "user", content: "hi" }],
            max_tokens: 1,
            temperature: 0,
          },
      responseContent,
      ...(responseSummary ? { responseSummary } : {}),
      finishReason,
      status,
      promptTokens: usage?.prompt_tokens ?? null,
      completionTokens: usage?.completion_tokens ?? null,
      totalTokens: usage?.total_tokens ?? null,
      costPrice: costUsd,
      sellPrice: sellUsd,
      latencyMs,
      errorMessage: params.error?.message ? sanitizeErrorMessage(params.error.message) : null,
      errorCode: params.error?.code ?? null,
      source: params.source,
    },
  });
}

// ============================================================
// BL-IMAGE-LOG-DISPLAY-FIX F-ILDF-01: image base64 落库前 strip 成 metadata。
// ============================================================
//
// OR image 模型（gemini-3-pro-image / gpt-image-mini 等）返回 ~1MB
// base64 data URL 直接落库会让 call_logs row 体积爆炸（实测 trc_aexj... =
// 993KB / trc_yyl... = 1.4MB），前端按 whitespace-pre-wrap 渲染会卡顿。
//
// 客户端 API 响应不动（OR base64 透传给调用方 — image-proxy.ts 已处理）；
// 仅落库时把 data: 转 metadata 字符串 [image:fmt, NKB]，http(s) URL（含
// gateway 签名 proxy URL）原样保留供前端 <img> 预览。
//
// 用 RFC 2397 标准 data URL 头解析（^data:[mime];base64,）；非标准格式
// fallback 到 [image:unknown, NKB]。
export function summarizeImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!url.startsWith("data:")) return url; // http(s) / proxy URL 透传
  // RFC 2397 允许 mime 后跟 `;param=value` 链再接 `;base64,`：
  //   data:image/webp+xml;charset=utf-8;base64,xxx
  // 扫到 `;base64,` 位置，再从 `data:` 后取到该位置的部分；其首段
  // （split first `;`）即真正 mime type。无 `;base64,` 时 fallback unknown。
  const base64Idx = url.indexOf(";base64,");
  let mime = "unknown";
  if (base64Idx > "data:".length) {
    const mimePart = url.substring("data:".length, base64Idx);
    const head = mimePart.split(";")[0];
    if (head) mime = head;
  }
  const format = mime.includes("/") ? (mime.split("/")[1] ?? "unknown") : mime;
  const sizeKB = Math.round(url.length / 1024);
  return `[image:${format}, ${sizeKB}KB]`;
}

/**
 * 异步处理图片请求日志 + 扣费
 */
export function processImageResult(params: ImagePostProcessParams): void {
  processImageResultAsync(params).catch((err) => {
    console.error("[post-process] image error:", err);
  });
}

/**
 * BL-EMBEDDING-MVP F-EM-02: 异步处理 embedding 请求日志 + 扣费。
 *
 * 复用 calculateTokenCost(usage, route, status)：把 EmbeddingResponse.usage
 * 转成 Usage shape（completion_tokens=0），output 单价 × 0 = 0，符合
 * input-only 计费语义。CallLog.responseSummary 写 modality='EMBEDDING' +
 * data_count + dimensions（首条向量长度）便于审计。
 */
export function processEmbeddingResult(params: EmbeddingPostProcessParams): void {
  processEmbeddingResultAsync(params).catch((err) => {
    console.error("[post-process] embedding error:", err);
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

  // F-AF2-01: if the client disconnected (abort signal fired) but the upstream
  // call completed successfully, treat it as TIMEOUT — the user never received
  // the response, so we must not charge them.
  const clientAborted = params.clientSignal?.aborted === true;
  const status =
    clientAborted && !isError ? ("TIMEOUT" as CallStatus) : mapCallStatus(finishReasonRaw, isError);
  const finishReason =
    clientAborted && !isError ? ("TIMEOUT" as FinishReason) : mapFinishReason(finishReasonRaw);

  // 计算成本（TIMEOUT → costUsd=0, sellUsd=0）
  const { costUsd, sellUsd } = calculateTokenCost(usage, params.route, status);

  // 定价缺失告警：成功调用但 sellPrice 为 0，说明 alias 未配置定价
  if (status === "SUCCESS" && usage && usage.total_tokens > 0 && sellUsd === 0) {
    console.warn(
      `[post-process] WARNING: zero sell price for alias=${params.route.alias?.alias ?? "unknown"} model=${params.modelName} tokens=${usage.total_tokens}. Check alias sellPrice config.`,
    );
  }

  const ttftMs = params.ttftTime ? params.ttftTime - params.startTime : null;
  const tokensPerSecond =
    usage && latencyMs > 0 ? usage.completion_tokens / (latencyMs / 1000) : null;

  // F-AF-02 + F-AF2-04: persist reasoning_tokens only when the model has
  // capabilities.reasoning === true. Non-reasoning models (e.g. glm-4.7-flash)
  // sometimes leak reasoning_tokens from upstream — we suppress them here.
  const modelCapabilities = (params.route.model?.capabilities ?? null) as {
    reasoning?: boolean;
  } | null;
  const isReasoningModel = modelCapabilities?.reasoning === true;
  const reasoningTokens = isReasoningModel ? usage?.reasoning_tokens : undefined;
  // F-BAX-04: 只在有多个尝试（失败过重试）时才写 attempt_chain，避免单次
  // 成功调用也留一条 {channelId} 增加 JSON 体积。
  const includeAttemptChain = Array.isArray(params.attemptChain) && params.attemptChain.length > 1;
  const responseSummaryObj: Record<string, unknown> = {};
  if (reasoningTokens !== undefined && reasoningTokens > 0) {
    responseSummaryObj.reasoning_tokens = reasoningTokens;
  }
  if (includeAttemptChain) {
    responseSummaryObj.attempt_chain = params.attemptChain;
  }
  const responseSummary: Prisma.InputJsonValue | undefined =
    Object.keys(responseSummaryObj).length > 0
      ? (responseSummaryObj as Prisma.InputJsonValue)
      : undefined;

  // F-BA-02: CallLog + deduct_balance 原子化
  // sellUsd>0 且 SUCCESS/FILTERED 时 $transaction 包裹两步；否则仅写 callLog。
  // deduct_balance 函数内部已 INSERT transactions(DEDUCTION) —— 这里不得再额外写入。
  const callLogData: Prisma.CallLogUncheckedCreateInput = {
    traceId: params.traceId,
    projectId: params.projectId,
    channelId: params.route.channel.id,
    modelName: params.modelName,
    promptSnapshot: params.promptSnapshot as unknown as object,
    requestParams: params.requestParams as Prisma.InputJsonValue,
    responseContent,
    ...(responseSummary ? { responseSummary } : {}),
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
    errorMessage: params.error?.message ? sanitizeErrorMessage(params.error.message) : null,
    errorCode: params.error?.code ?? null,
    actionId: params.actionId ?? null,
    actionVersionId: params.actionVersionId ?? null,
    templateRunId: params.templateRunId ?? null,
    source: params.source ?? "api",
  };

  const shouldDeduct = sellUsd > 0 && (status === "SUCCESS" || status === "FILTERED");
  if (shouldDeduct) {
    await prisma.$transaction(async (tx) => {
      const callLog = await tx.callLog.create({ data: callLogData });
      await deductBalance(tx, params.userId, params.projectId, sellUsd, callLog.id, params.traceId);
    });
    // F-RL-04: feed the spending rate limiter immediately so the next
    // incoming request sees the accurate per-minute tally.
    recordSpending(params.userId, sellUsd).catch(() => {});
  } else {
    await prisma.callLog.create({ data: callLogData });
  }

  // BL-INFRA-RESILIENCE F-IR-03 / H-6: fetch Project once and reuse across
  // balance-alert and TPM recording. Previously the hot path issued two
  // findUnique calls on every successful request (balance alert inside
  // triggers + TPM recording here).
  const needsProject = shouldDeduct || (usage != null && usage.total_tokens > 0);
  if (needsProject) {
    const project = await prisma.project.findUnique({
      where: { id: params.projectId },
      select: { id: true, alertThreshold: true, rateLimit: true },
    });
    if (project) {
      if (shouldDeduct) {
        // F-UA-03: check if balance dropped below alertThreshold
        checkAndSendBalanceLowAlert(params.userId, project).catch(() => {});
      }
      if (usage && usage.total_tokens > 0) {
        recordTokenUsage(project, usage.total_tokens).catch(() => {});
      }
    }
  }
}

async function processImageResultAsync(params: ImagePostProcessParams): Promise<void> {
  const latencyMs = Date.now() - params.startTime;
  const isError = !!params.error;

  // F-ACF-01: zero-image delivery → status=FILTERED, cost=0, no deduction.
  // If upstream returned no images we treat the call as a failed delivery and
  // never charge the user, regardless of HTTP 200.
  const imagesCount = params.response?.data?.length ?? 0;
  const zeroImageDelivery = !isError && imagesCount === 0;

  // F-AF2-01: client disconnect → TIMEOUT, no charge (same logic as chat)
  const clientAborted = params.clientSignal?.aborted === true;

  let status: CallStatus;
  if (clientAborted && !isError) status = "TIMEOUT";
  else if (isError) status = "ERROR";
  else if (zeroImageDelivery) status = "FILTERED";
  else status = "SUCCESS";

  // BL-IMAGE-PRICING-OR-P2 fix_round 2 (Path A #2): image-via-chat 模型
  // （OR 6 条 token-priced image channel 等）的 channel.costPrice 是
  // {unit:"token",inputPer1M,outputPer1M}，按 chat tokens 计费；imageViaChat
  // adapter 已 propagate 上游 chat usage 到 response.usage。这里据 channel
  // costPrice.unit 分支：token → calculateTokenCost；call → 旧 calculateCallCost。
  const channelCostPrice = params.route.channel.costPrice as { unit?: string } | null;
  const isTokenPriced = channelCostPrice?.unit === "token";
  const upstreamUsage: Usage | null = params.response?.usage ?? null;

  let costUsd: number;
  let sellUsd: number;
  if (isTokenPriced) {
    ({ costUsd, sellUsd } = calculateTokenCost(upstreamUsage, params.route, status));
  } else {
    ({ costUsd, sellUsd } = calculateCallCost(params.route, status));
  }

  // 定价缺失告警：成功调用但 sellPrice 为 0，说明 alias 未配置定价
  if (status === "SUCCESS" && sellUsd === 0) {
    console.warn(
      `[post-process] WARNING: zero sell price for image call alias=${params.route.alias?.alias ?? "unknown"} model=${params.modelName}. Check alias sellPrice config.`,
    );
  }

  // F-BAX-04 image costPrice regression fix：channel.costPrice 缺 perCall
  // 配置时显式告警（仅 per-call 路径；token-priced 走另一分支）。
  if (status === "SUCCESS" && !isTokenPriced) {
    const costPriceCfg = params.route.channel.costPrice as { perCall?: number } | null;
    if (!costPriceCfg || typeof costPriceCfg.perCall !== "number") {
      console.warn(
        `[post-process] WARNING: image channel ${params.route.channel.id} (${params.route.provider.name}/${params.modelName}) missing costPrice.perCall — costPrice recorded as 0. Fix channel.costPrice in admin.`,
      );
    }
  }

  // 持久化 images_count + 上游原始 URL 列表（F-ACF-07 代理查找源）。
  // F-ILDF-01: data: base64 在落库前转 metadata，http(s) URL 透传不变。
  const originalUrls = (params.response?.data ?? [])
    .map((d) => summarizeImageUrl(d?.url))
    .filter((u): u is string => typeof u === "string" && u.length > 0);
  // F-BAX-04: 多次尝试（失败过）才写 attempt_chain，避免单次成功也增加体积。
  const includeAttemptChain = Array.isArray(params.attemptChain) && params.attemptChain.length > 1;
  const responseSummary = {
    images_count: imagesCount,
    ...(originalUrls.length > 0 ? { original_urls: originalUrls } : {}),
    ...(zeroImageDelivery ? { zero_image_delivery: true } : {}),
    ...(includeAttemptChain ? { attempt_chain: params.attemptChain } : {}),
  } as unknown as Prisma.InputJsonValue;

  // F-BA-02: 图片扣费 atomicity —— 与 chat 路径逻辑一致。
  // image-via-chat token 路径：附带 promptTokens/completionTokens/totalTokens
  // 让 admin 面板 + 对账 cron 能查 usage（与 chat 路径一致）。
  const imageCallLogData: Prisma.CallLogUncheckedCreateInput = {
    traceId: params.traceId,
    projectId: params.projectId,
    channelId: params.route.channel.id,
    modelName: params.modelName,
    promptSnapshot: [{ role: "user", content: params.requestParams.prompt }] as unknown as object,
    requestParams: params.requestParams as Prisma.InputJsonValue,
    // F-ILDF-01: data: base64 → [image:fmt, NKB] metadata；http(s) 透传
    responseContent: summarizeImageUrl(params.response?.data?.[0]?.url) ?? null,
    responseSummary,
    status,
    latencyMs,
    costPrice: costUsd,
    sellPrice: sellUsd,
    promptTokens: upstreamUsage?.prompt_tokens ?? null,
    completionTokens: upstreamUsage?.completion_tokens ?? null,
    totalTokens: upstreamUsage?.total_tokens ?? null,
    errorMessage: params.error?.message
      ? sanitizeErrorMessage(params.error.message)
      : zeroImageDelivery
        ? "Image generation failed, model did not return a valid image"
        : null,
    errorCode: params.error?.code ?? (zeroImageDelivery ? "zero_image_delivery" : null),
    source: params.source ?? "api",
  };

  const shouldDeduct = sellUsd > 0 && status === "SUCCESS";
  if (shouldDeduct) {
    await prisma.$transaction(async (tx) => {
      const callLog = await tx.callLog.create({ data: imageCallLogData });
      await deductBalance(tx, params.userId, params.projectId, sellUsd, callLog.id, params.traceId);
    });
    recordSpending(params.userId, sellUsd).catch(() => {});
    // F-UA-03: check if balance dropped below alertThreshold
    checkAndSendBalanceLowAlert(params.userId, params.projectId).catch(() => {});
  } else {
    await prisma.callLog.create({ data: imageCallLogData });
  }
}

async function processEmbeddingResultAsync(params: EmbeddingPostProcessParams): Promise<void> {
  const latencyMs = Date.now() - params.startTime;
  const isError = !!params.error;

  // EmbeddingResponse.usage = { prompt_tokens, total_tokens } — 转成 chat
  // 风格 Usage（completion_tokens=0），让 calculateTokenCost output 项 × 0 = 0
  const embUsage = params.response?.usage ?? null;
  const usage: Usage | null = embUsage
    ? {
        prompt_tokens: embUsage.prompt_tokens,
        completion_tokens: 0,
        total_tokens: embUsage.total_tokens,
      }
    : null;

  // status: 有 data 即 SUCCESS，否则 ERROR/FILTERED
  const dataCount = params.response?.data?.length ?? 0;
  const status: CallStatus = isError ? "ERROR" : dataCount > 0 ? "SUCCESS" : "FILTERED";
  const finishReason: FinishReason | null = isError
    ? "ERROR"
    : status === "SUCCESS"
      ? "STOP"
      : null;

  const { costUsd, sellUsd } = calculateTokenCost(usage, params.route, status);

  // 定价缺失告警（与 chat 一致）
  if (status === "SUCCESS" && usage && usage.prompt_tokens > 0 && sellUsd === 0) {
    console.warn(
      `[post-process] WARNING: zero sell price for embedding alias=${params.route.alias?.alias ?? "unknown"} model=${params.modelName} tokens=${usage.prompt_tokens}. Check alias sellPrice config.`,
    );
  }

  // responseSummary 记录 modality + data_count + dimensions（首条向量长度）
  const dimensions = params.response?.data?.[0]?.embedding?.length ?? null;
  const responseSummaryObj: Record<string, unknown> = {
    modality: "EMBEDDING",
    data_count: dataCount,
  };
  if (dimensions !== null) responseSummaryObj.dimensions = dimensions;
  const includeAttemptChain = Array.isArray(params.attemptChain) && params.attemptChain.length > 1;
  if (includeAttemptChain) responseSummaryObj.attempt_chain = params.attemptChain;
  const responseSummary = responseSummaryObj as Prisma.InputJsonValue;

  const callLogData: Prisma.CallLogUncheckedCreateInput = {
    traceId: params.traceId,
    projectId: params.projectId,
    channelId: params.route.channel.id,
    modelName: params.modelName,
    promptSnapshot: params.promptSnapshot as unknown as object,
    requestParams: params.requestParams as Prisma.InputJsonValue,
    responseContent: null, // embedding 无文本响应
    responseSummary,
    finishReason,
    status,
    promptTokens: usage?.prompt_tokens ?? null,
    completionTokens: 0,
    totalTokens: usage?.total_tokens ?? null,
    costPrice: costUsd,
    sellPrice: sellUsd,
    latencyMs,
    ttftMs: null,
    tokensPerSecond: null,
    errorMessage: params.error?.message ? sanitizeErrorMessage(params.error.message) : null,
    errorCode: params.error?.code ?? null,
    actionId: params.actionId ?? null,
    actionVersionId: params.actionVersionId ?? null,
    templateRunId: params.templateRunId ?? null,
    source: params.source ?? "api",
  };

  const shouldDeduct = sellUsd > 0 && status === "SUCCESS";
  if (shouldDeduct) {
    await prisma.$transaction(async (tx) => {
      const callLog = await tx.callLog.create({ data: callLogData });
      await deductBalance(tx, params.userId, params.projectId, sellUsd, callLog.id, params.traceId);
    });
    recordSpending(params.userId, sellUsd).catch(() => {});
    checkAndSendBalanceLowAlert(params.userId, params.projectId).catch(() => {});
  } else {
    await prisma.callLog.create({ data: callLogData });
  }
}

// ============================================================
// 成本计算
// ============================================================

export function calculateTokenCost(
  usage: Usage | null,
  route: RouteResult,
  status: CallStatus,
): { costUsd: number; sellUsd: number } {
  if (!usage || (status !== "SUCCESS" && status !== "FILTERED")) {
    return { costUsd: 0, sellUsd: 0 };
  }

  const costPrice = (route.channel.costPrice ?? {}) as {
    inputPer1M?: number;
    outputPer1M?: number;
    unit?: string;
  };
  // 扣费价从 alias.sellPrice 取（统一定价源），fallback 到 channel.sellPrice 兜底；
  // 两者均为 null 时退化为 {}，后续 `?? 0` 保护下 sellUsd=0（未配置定价 → 不扣费）
  const sellPrice = (route.alias?.sellPrice ?? route.channel.sellPrice ?? {}) as {
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

  // BL-RECON-FIX-PHASE2 F-RP-02: 上游直返实收 USD 时短路 token×单价 公式。
  // 解决 image-via-chat 单价错位漏算（OR gemini-2.5-flash-image image-output
  // 实价 ≈ $30/M vs 配置的文本 output $2.5/M → 12× 漏算）。
  // FILTERED 仍走原公式（仅算输入），不消费 upstream cost。
  const upstreamCostUsd = usage.upstreamCostUsd;
  const useUpstreamCost =
    status === "SUCCESS" &&
    upstreamCostUsd !== undefined &&
    Number.isFinite(upstreamCostUsd) &&
    upstreamCostUsd > 0;

  const costUsd = useUpstreamCost
    ? upstreamCostUsd
    : ((inputTokens * (costPrice.inputPer1M ?? 0)) / 1_000_000 +
        (outputTokens * (costPrice.outputPer1M ?? 0)) / 1_000_000) *
      exchangeRate;

  // sellUsd 不变：用户卖价由 alias.sellPrice / channel.sellPrice 公式决定，
  // 是产品定价决策，与上游成本短路无关。
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
  // 扣费价从 alias.sellPrice 取（统一定价源）
  // 如果 alias.sellPrice 存在但没有 perCall（例如误配为 token 计价），fallback 到 channel.sellPrice
  const aliasSp = route.alias?.sellPrice as { perCall?: number } | null;
  const channelSp = route.channel.sellPrice as { perCall?: number } | null;
  const sellPrice = (aliasSp?.perCall !== undefined ? aliasSp : channelSp) ?? { perCall: 0 };

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

type ExtendedPrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function deductBalance(
  tx: ExtendedPrismaTx,
  userId: string,
  projectId: string,
  amount: number,
  callLogId: string,
  traceId?: string,
): Promise<void> {
  if (amount <= 0) return;

  // Minimum charge protection: prevent micro amounts from being truncated to $0
  const MIN_CHARGE = 0.00000001;
  const finalAmount = amount < MIN_CHARGE ? MIN_CHARGE : amount;

  await tx.$queryRaw`
    SELECT * FROM deduct_balance(
      ${userId}::TEXT,
      ${projectId}::TEXT,
      ${finalAmount}::DECIMAL(16,8),
      ${callLogId}::TEXT,
      ${"API call deduction"}::TEXT,
      ${traceId ?? null}::TEXT
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
