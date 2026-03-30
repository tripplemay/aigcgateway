/**
 * 服务商 /models 接口适配层
 *
 * 为每家服务商实现 fetchModels()，返回统一格式。
 * 不支持 /models 的服务商（如火山引擎）从 ProviderConfig.staticModels 回退。
 */

import type { Provider, ProviderConfig } from "@prisma/client";

// ============================================================
// 统一模型格式
// ============================================================

export interface SyncedModel {
  /** 服务商返回的原始 model id（即 realModelId） */
  id: string;
  /** 统一命名：provider/model */
  name: string;
  /** 显示名称 */
  displayName: string;
  /** 模态：TEXT | IMAGE */
  modality: "TEXT" | "IMAGE";
  /** 上下文窗口 */
  contextWindow?: number;
  /** 定价信息（如果服务商返回了） */
  pricing?: {
    inputPer1M?: number;
    outputPer1M?: number;
    perCall?: number;
    unit: "token" | "call";
  };
}

type ProviderWithConfig = Provider & { config: ProviderConfig | null };

// ============================================================
// 通用 fetch with timeout + proxy
// ============================================================

async function fetchWithTimeout(
  url: string,
  headers: Record<string, string>,
  provider: Provider,
  timeoutMs = 15_000,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const proxyUrl =
    provider.proxyUrl ?? process.env.PROXY_URL_PRIMARY ?? null;

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

// ============================================================
// 辅助：推断 modality
// ============================================================

function inferModality(modelId: string): "TEXT" | "IMAGE" {
  const lower = modelId.toLowerCase();
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
  return imageKeywords.some((kw) => lower.includes(kw)) ? "IMAGE" : "TEXT";
}

// ============================================================
// 各服务商适配
// ============================================================

/** OpenAI: GET /v1/models */
async function fetchOpenAI(provider: ProviderWithConfig): Promise<SyncedModel[]> {
  const authConfig = provider.authConfig as { apiKey?: string };
  const res = await fetchWithTimeout(
    `${provider.baseUrl.replace(/\/+$/, "")}/models`,
    { Authorization: `Bearer ${authConfig?.apiKey ?? ""}` },
    provider,
  );
  if (!res.ok) throw new Error(`OpenAI /models returned ${res.status}`);
  const json = await res.json();
  const models = (json.data ?? []) as Array<{
    id: string;
    owned_by?: string;
  }>;

  return models.map((m) => ({
    id: m.id,
    name: `openai/${m.id}`,
    displayName: m.id,
    modality: inferModality(m.id),
  }));
}

/** Anthropic: GET /v1/models */
async function fetchAnthropic(provider: ProviderWithConfig): Promise<SyncedModel[]> {
  const authConfig = provider.authConfig as { apiKey?: string };
  const baseUrl = provider.baseUrl.replace(/\/+$/, "");
  const res = await fetchWithTimeout(
    `${baseUrl}/models`,
    {
      "x-api-key": authConfig?.apiKey ?? "",
      "anthropic-version": "2023-06-01",
    },
    provider,
  );
  if (!res.ok) throw new Error(`Anthropic /models returned ${res.status}`);
  const json = await res.json();
  const models = (json.data ?? []) as Array<{
    id: string;
    display_name?: string;
    type?: string;
  }>;

  return models.map((m) => ({
    id: m.id,
    name: `anthropic/${m.id}`,
    displayName: m.display_name ?? m.id,
    modality: "TEXT" as const,
  }));
}

/** DeepSeek: GET /v1/models (OpenAI-compatible) */
async function fetchDeepSeek(provider: ProviderWithConfig): Promise<SyncedModel[]> {
  const authConfig = provider.authConfig as { apiKey?: string };
  const baseUrl = provider.baseUrl.replace(/\/+$/, "");
  const res = await fetchWithTimeout(
    `${baseUrl}/models`,
    { Authorization: `Bearer ${authConfig?.apiKey ?? ""}` },
    provider,
  );
  if (!res.ok) throw new Error(`DeepSeek /models returned ${res.status}`);
  const json = await res.json();
  const models = (json.data ?? []) as Array<{ id: string }>;

  return models.map((m) => ({
    id: m.id,
    name: `deepseek/${m.id}`,
    displayName: m.id,
    modality: inferModality(m.id),
  }));
}

/** 智谱 AI: GET /v4/models */
async function fetchZhipu(provider: ProviderWithConfig): Promise<SyncedModel[]> {
  const authConfig = provider.authConfig as { apiKey?: string };
  const baseUrl = provider.baseUrl.replace(/\/+$/, "");
  const res = await fetchWithTimeout(
    `${baseUrl}/models`,
    { Authorization: `Bearer ${authConfig?.apiKey ?? ""}` },
    provider,
  );
  if (!res.ok) throw new Error(`Zhipu /models returned ${res.status}`);
  const json = await res.json();
  const models = (json.data ?? []) as Array<{ id: string }>;

  return models.map((m) => ({
    id: m.id,
    name: `zhipu/${m.id}`,
    displayName: m.id,
    modality: inferModality(m.id),
  }));
}

/** 硅基流动: GET /v1/models */
async function fetchSiliconFlow(provider: ProviderWithConfig): Promise<SyncedModel[]> {
  const authConfig = provider.authConfig as { apiKey?: string };
  const baseUrl = provider.baseUrl.replace(/\/+$/, "");
  const res = await fetchWithTimeout(
    `${baseUrl}/models`,
    { Authorization: `Bearer ${authConfig?.apiKey ?? ""}` },
    provider,
  );
  if (!res.ok) throw new Error(`SiliconFlow /models returned ${res.status}`);
  const json = await res.json();
  const models = (json.data ?? []) as Array<{ id: string }>;

  return models.map((m) => ({
    id: m.id,
    name: `siliconflow/${m.id}`,
    displayName: m.id,
    modality: inferModality(m.id),
  }));
}

/** OpenRouter: GET /v1/models (has pricing) */
async function fetchOpenRouter(provider: ProviderWithConfig): Promise<SyncedModel[]> {
  const authConfig = provider.authConfig as { apiKey?: string };
  const baseUrl = provider.baseUrl.replace(/\/+$/, "");
  const res = await fetchWithTimeout(
    `${baseUrl}/models`,
    { Authorization: `Bearer ${authConfig?.apiKey ?? ""}` },
    provider,
  );
  if (!res.ok) throw new Error(`OpenRouter /models returned ${res.status}`);
  const json = await res.json();
  const models = (json.data ?? []) as Array<{
    id: string;
    name?: string;
    context_length?: number;
    pricing?: { prompt?: string; completion?: string };
    architecture?: { modality?: string };
  }>;

  return models.map((m) => {
    const pricing = m.pricing
      ? {
          inputPer1M: parseFloat(m.pricing.prompt ?? "0") * 1_000_000,
          outputPer1M: parseFloat(m.pricing.completion ?? "0") * 1_000_000,
          unit: "token" as const,
        }
      : undefined;

    return {
      id: m.id,
      name: `openrouter/${m.id}`,
      displayName: m.name ?? m.id,
      modality: inferModality(m.id),
      contextWindow: m.context_length,
      pricing,
    };
  });
}

// ============================================================
// 静态模型回退（F104）
// ============================================================

interface StaticModelDef {
  id: string;
  name: string;
  modality?: string;
  contextWindow?: number;
}

export function parseStaticModels(
  providerName: string,
  staticModels: unknown,
): SyncedModel[] {
  if (!Array.isArray(staticModels)) return [];

  return (staticModels as StaticModelDef[]).map((m) => ({
    id: m.id,
    name: `${providerName}/${m.id}`,
    displayName: m.name ?? m.id,
    modality: (m.modality === "IMAGE" ? "IMAGE" : "TEXT") as "TEXT" | "IMAGE",
    contextWindow: m.contextWindow,
  }));
}

// ============================================================
// 导出：统一入口
// ============================================================

const FETCHERS: Record<
  string,
  (provider: ProviderWithConfig) => Promise<SyncedModel[]>
> = {
  openai: fetchOpenAI,
  anthropic: fetchAnthropic,
  deepseek: fetchDeepSeek,
  zhipu: fetchZhipu,
  siliconflow: fetchSiliconFlow,
  openrouter: fetchOpenRouter,
};

/**
 * 获取服务商的模型列表。
 * - supportsModelsApi = true → 调用 /models API
 * - supportsModelsApi = false → 从 staticModels 回退
 */
export async function fetchProviderModels(
  provider: ProviderWithConfig,
): Promise<SyncedModel[]> {
  const config = provider.config;

  // 静态模型回退
  if (!config?.supportsModelsApi) {
    return parseStaticModels(provider.name, config?.staticModels);
  }

  // 优先使用专属 fetcher，否则尝试通用 OpenAI 兼容格式
  const fetcher = FETCHERS[provider.name];
  if (fetcher) {
    return fetcher(provider);
  }

  // 通用兜底：尝试 GET baseUrl/models
  const authConfig = provider.authConfig as { apiKey?: string };
  const baseUrl = provider.baseUrl.replace(/\/+$/, "");
  const res = await fetchWithTimeout(
    `${baseUrl}/models`,
    { Authorization: `Bearer ${authConfig?.apiKey ?? ""}` },
    provider,
  );
  if (!res.ok) throw new Error(`${provider.name} /models returned ${res.status}`);
  const json = await res.json();
  const models = (json.data ?? []) as Array<{ id: string }>;

  return models.map((m) => ({
    id: m.id,
    name: `${provider.name}/${m.id}`,
    displayName: m.id,
    modality: inferModality(m.id),
  }));
}
