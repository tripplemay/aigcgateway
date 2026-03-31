/**
 * SyncAdapter 接口 — 每家服务商实现专属同步逻辑
 */

import type { Provider, ProviderConfig } from "@prisma/client";

export type ProviderWithConfig = Provider & { config: ProviderConfig | null };

/** 服务商同步后返回的统一模型格式 */
export interface SyncedModel {
  /** 服务商原始 model ID（即 realModelId） */
  modelId: string;
  /** 统一命名：provider/model */
  name: string;
  /** 显示名称 */
  displayName: string;
  /** 模态 */
  modality: "TEXT" | "IMAGE";
  /** 上下文窗口 */
  contextWindow?: number;
  /** 最大输出 token */
  maxOutputTokens?: number;
  /** 输入价格（美元/百万 token） */
  inputPricePerM?: number;
  /** 输出价格（美元/百万 token） */
  outputPricePerM?: number;
  /** 模型能力标签 */
  capabilities?: string[];
}

/** 同步适配器接口 */
export interface SyncAdapter {
  readonly providerName: string;
  fetchModels(provider: ProviderWithConfig): Promise<SyncedModel[]>;
}

/** pricingOverrides 中单条模型的覆盖定义 */
export interface PricingOverride {
  inputPricePerM?: number;
  outputPricePerM?: number;
  inputPriceCNYPerM?: number;
  outputPriceCNYPerM?: number;
  contextWindow?: number;
  maxOutputTokens?: number;
  displayName?: string;
  modality?: "text" | "image";
}

/** 从 ProviderConfig.pricingOverrides 读取指定模型的覆盖 */
export function getPricingOverride(
  config: ProviderConfig | null,
  modelId: string,
): PricingOverride | undefined {
  if (!config?.pricingOverrides) return undefined;
  const overrides = config.pricingOverrides as Record<string, PricingOverride>;
  return overrides[modelId];
}

/** 推断 modality */
export function inferModality(modelId: string): "TEXT" | "IMAGE" {
  const lower = modelId.toLowerCase();
  const imageKeywords = [
    "dall-e", "image", "cogview", "seedream",
    "stable-diffusion", "sd-", "sdxl", "flux", "midjourney",
  ];
  return imageKeywords.some((kw) => lower.includes(kw)) ? "IMAGE" : "TEXT";
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
