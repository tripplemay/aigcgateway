/**
 * SyncAdapter 基础工具 + 类型重导出
 */

import type { Provider, ProviderConfig } from "@prisma/client";

// 重导出共享类型（适配器继续从 base 导入即可）
export type { ProviderWithConfig, SyncedModel, SyncAdapter, PricingOverride } from "../types";

/** 从 ProviderConfig.pricingOverrides 读取指定模型的覆盖 */
export function getPricingOverride(
  config: ProviderConfig | null,
  modelId: string,
): import("../types").PricingOverride | undefined {
  if (!config?.pricingOverrides) return undefined;
  const overrides = config.pricingOverrides as Record<string, import("../types").PricingOverride>;
  return overrides[modelId];
}

/** 推断 modality（扩展版：支持 EMBEDDING/RERANKING/AUDIO） */
export type InferredModality = "TEXT" | "IMAGE" | "EMBEDDING" | "RERANKING" | "AUDIO";

export function inferModality(modelId: string): InferredModality {
  const lower = modelId.toLowerCase();

  // RERANKING（优先于 EMBEDDING，因为 bge-reranker 同时含 "bge" 和 "reranker"）
  const rerankKeywords = ["reranker", "rerank"];
  if (rerankKeywords.some((kw) => lower.includes(kw))) return "RERANKING";

  // EMBEDDING（bge 系列名称不含 "embedding"，需用 "bge" 关键词）
  const embeddingKeywords = ["bge", "embed", "e5-", "text-embedding"];
  if (embeddingKeywords.some((kw) => lower.includes(kw))) return "EMBEDDING";

  // AUDIO（TTS/ASR/语音）
  const audioKeywords = [
    "tts",
    "whisper",
    "asr",
    "cosyvoice",
    "sensevoice",
    "speech",
    "audio",
    "voice",
    "indextts",
  ];
  if (audioKeywords.some((kw) => lower.includes(kw))) return "AUDIO";

  // IMAGE
  const imageKeywords = [
    "dall-e",
    "image",
    "cogview",
    "seedream",
    "stable-diffusion",
    "sd-",
    "sdxl",
    "flux",
    "midjourney",
  ];
  if (imageKeywords.some((kw) => lower.includes(kw))) return "IMAGE";

  return "TEXT";
}

/** 判断模型是否为对话类（TEXT 或 IMAGE） */
export function isChatModality(modelId: string): boolean {
  const m = inferModality(modelId);
  return m === "TEXT" || m === "IMAGE";
}

/** 通用 fetch with timeout + proxy */
export async function fetchWithTimeout(
  url: string,
  headers: Record<string, string>,
  provider: Provider,
  timeoutMs = 15_000,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const proxyUrl = provider.proxyUrl ?? process.env.PROXY_URL_PRIMARY ?? null;

  try {
    if (proxyUrl) {
      const { ProxyAgent, fetch: undiciFetch } = await import("undici");
      const dispatcher = new ProxyAgent(proxyUrl);
      return await (undiciFetch as unknown as typeof fetch)(url, {
        headers,
        signal: controller.signal,
        // @ts-expect-error undici dispatcher option
        dispatcher,
      });
    }
    return await fetch(url, { headers, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

/** 从 Provider.authConfig 获取 API Key */
export function getApiKey(provider: Provider): string {
  const authConfig = provider.authConfig as { apiKey?: string } | null;
  return authConfig?.apiKey ?? "";
}

/** 获取 base URL（去掉尾部斜杠） */
export function getBaseUrl(provider: Provider): string {
  return provider.baseUrl.replace(/\/+$/, "");
}
