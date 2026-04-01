/**
 * AI 文档提取层 — 第 2 层同步
 *
 * 读取服务商官方文档页面，用 AI 提取模型列表和定价信息，
 * 补全第 1 层 /models API 缺失的数据。
 */

import type { Provider, ProviderConfig } from "@prisma/client";
import type { SyncedModel } from "./types";
import { prisma } from "@/lib/prisma";
import { getApiKey, getBaseUrl } from "./adapters/base";

const EXCHANGE_RATE = parseFloat(process.env.EXCHANGE_RATE_CNY_TO_USD ?? "0.137");

// ============================================================
// AI 提取 Prompt
// ============================================================

const EXTRACTION_PROMPT = `你是一个 API 定价数据提取助手。请从以下网页内容中提取所有可通过 API 调用的 AI 模型信息。
对每个模型，提取以下字段（如果页面中有的话）：

model_id: 模型的 API 调用 ID（如 "gpt-4o"、"deepseek-chat"、"glm-4-plus"）
display_name: 模型显示名称
modality: "text" 或 "image"
context_window: 上下文窗口大小（token 数，如 128000）
max_output_tokens: 最大输出 token 数
input_price: 输入价格（数字）
output_price: 输出价格（数字）
price_unit: 价格单位（如 "USD/1M tokens"、"CNY/1M tokens"、"USD/image"）

只返回 JSON 数组，不要任何其他文字或 markdown 格式。如果页面中没有模型信息，返回空数组 []。
网页内容：
`;

// ============================================================
// AI 返回结果类型
// ============================================================

interface AIExtractedModel {
  model_id?: string;
  display_name?: string;
  modality?: string;
  context_window?: number;
  max_output_tokens?: number;
  input_price?: number;
  output_price?: number;
  price_unit?: string;
}

// ============================================================
// 内部 AI 调用（绕过 API Gateway 鉴权和计费）
// ============================================================

async function callInternalAI(prompt: string): Promise<string> {
  // 从数据库获取 DeepSeek Provider 的凭证
  const deepseekProvider = await prisma.provider.findUnique({
    where: { name: "deepseek" },
  });

  if (!deepseekProvider) {
    throw new Error("DeepSeek provider not found in database");
  }

  const apiKey = getApiKey(deepseekProvider);
  const baseUrl = getBaseUrl(deepseekProvider);

  if (!apiKey || apiKey.startsWith("PLACEHOLDER")) {
    throw new Error("DeepSeek API key not configured");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120_000);

  try {
    const proxyUrl = deepseekProvider.proxyUrl ?? process.env.PROXY_URL_PRIMARY ?? null;

    const body = JSON.stringify({
      model: "deepseek-chat",
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_tokens: 8192,
      response_format: { type: "json_object" },
    });

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    };

    let response: Response;

    if (proxyUrl) {
      const { ProxyAgent, fetch: undiciFetch } = await import("undici");
      const dispatcher = new ProxyAgent(proxyUrl);
      response = await (undiciFetch as unknown as typeof fetch)(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
        // @ts-expect-error undici dispatcher option
        dispatcher,
      });
    } else {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
      });
    }

    if (!response.ok) {
      throw new Error(`DeepSeek API returned ${response.status}`);
    }

    const json = await response.json();
    const content = (json as { choices: Array<{ message: { content: string } }> }).choices?.[0]
      ?.message?.content;

    if (!content) {
      throw new Error("Empty response from DeepSeek");
    }

    return content;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================================
// 页面内容获取（通过 Jina Reader 渲染 SPA 页面）
// ============================================================

const JINA_READER_PREFIX = "https://r.jina.ai/";

async function fetchDocPage(url: string): Promise<string> {
  const jinaUrl = `${JINA_READER_PREFIX}${url}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(jinaUrl, {
      headers: {
        Accept: "text/plain",
        "User-Agent": "Mozilla/5.0 (compatible; AIGC-Gateway-Sync/1.0)",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Jina Reader returned ${response.status} for ${url}`);
    }

    const text = await response.text();

    // Jina 返回 markdown，截断到 ~10k 字符（定价表通常在前部分）
    return text.slice(0, 10_000);
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================================
// 解析 AI 返回 → SyncedModel[]
// ============================================================

function parseAIResponse(raw: string, providerName: string): SyncedModel[] {
  let parsed: AIExtractedModel[];

  try {
    const jsonContent = raw.trim();
    // AI 可能返回 { "models": [...] } 或直接 [...]
    const obj = JSON.parse(jsonContent);
    if (Array.isArray(obj)) {
      parsed = obj;
    } else if (obj.models && Array.isArray(obj.models)) {
      parsed = obj.models;
    } else {
      console.log(`[doc-enricher] AI returned non-array JSON for ${providerName}, skipping`);
      return [];
    }
  } catch {
    console.log(`[doc-enricher] Failed to parse AI JSON for ${providerName}, skipping`);
    return [];
  }

  return parsed
    .filter((m) => m.model_id)
    .map((m) => {
      const modelId = m.model_id!;
      const isCNY = m.price_unit?.includes("CNY") || m.price_unit?.includes("元");

      let inputPricePerM: number | undefined;
      let outputPricePerM: number | undefined;

      if (m.input_price !== undefined && m.input_price !== null) {
        inputPricePerM = isCNY ? +(m.input_price * EXCHANGE_RATE).toFixed(4) : m.input_price;
      }
      if (m.output_price !== undefined && m.output_price !== null) {
        outputPricePerM = isCNY ? +(m.output_price * EXCHANGE_RATE).toFixed(4) : m.output_price;
      }

      const modality =
        m.modality?.toLowerCase() === "image" ? ("IMAGE" as const) : ("TEXT" as const);

      return {
        modelId,
        name: `${providerName}/${modelId}`,
        displayName: m.display_name ?? modelId,
        modality,
        contextWindow: m.context_window,
        maxOutputTokens: m.max_output_tokens,
        inputPricePerM,
        outputPricePerM,
      };
    });
}

// ============================================================
// 合并逻辑：API 已有字段不覆盖，缺失字段用 AI 结果填充
// ============================================================

function mergeModels(apiModels: SyncedModel[], aiModels: SyncedModel[]): SyncedModel[] {
  const merged = [...apiModels];
  const byModelId = new Map(apiModels.map((m) => [m.modelId, m]));
  const byName = new Map(apiModels.map((m) => [m.name, m]));

  for (const aiModel of aiModels) {
    const existing = byModelId.get(aiModel.modelId) ?? byName.get(aiModel.name);

    if (existing) {
      // 只补不覆盖
      if (existing.contextWindow === undefined && aiModel.contextWindow !== undefined) {
        existing.contextWindow = aiModel.contextWindow;
      }
      if (existing.maxOutputTokens === undefined && aiModel.maxOutputTokens !== undefined) {
        existing.maxOutputTokens = aiModel.maxOutputTokens;
      }
      if (existing.inputPricePerM === undefined && aiModel.inputPricePerM !== undefined) {
        existing.inputPricePerM = aiModel.inputPricePerM;
      }
      if (existing.outputPricePerM === undefined && aiModel.outputPricePerM !== undefined) {
        existing.outputPricePerM = aiModel.outputPricePerM;
      }
      if (existing.displayName === existing.modelId && aiModel.displayName !== aiModel.modelId) {
        existing.displayName = aiModel.displayName;
      }
    } else {
      // AI 发现的新模型，直接添加
      merged.push(aiModel);
      byModelId.set(aiModel.modelId, aiModel);
      byName.set(aiModel.name, aiModel);
    }
  }

  return merged;
}

// ============================================================
// 公共接口
// ============================================================

export async function enrichFromDocs(
  provider: Provider,
  config: ProviderConfig,
  existingModels: SyncedModel[],
): Promise<{ models: SyncedModel[]; aiEnriched: number }> {
  const docUrls = config.docUrls as string[] | null;
  if (!docUrls || !Array.isArray(docUrls) || docUrls.length === 0) {
    return { models: existingModels, aiEnriched: 0 };
  }

  const allAIModels: SyncedModel[] = [];

  for (const url of docUrls) {
    try {
      console.log(`[doc-enricher] Fetching ${url} for ${provider.name}...`);
      const content = await fetchDocPage(url);

      if (content.length < 100) {
        console.log(`[doc-enricher] Page too short for ${url}, skipping`);
        continue;
      }

      console.log(`[doc-enricher] Calling AI for ${provider.name} (${content.length} chars)...`);
      const aiResponse = await callInternalAI(EXTRACTION_PROMPT + content);
      const aiModels = parseAIResponse(aiResponse, provider.name);
      console.log(`[doc-enricher] AI extracted ${aiModels.length} models from ${url}`);

      allAIModels.push(...aiModels);
    } catch (err) {
      console.log(
        `[doc-enricher] Failed for ${provider.name} url=${url}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  if (allAIModels.length === 0) {
    return { models: existingModels, aiEnriched: 0 };
  }

  const countMissingBefore = existingModels.filter(
    (m) => m.inputPricePerM === undefined || m.outputPricePerM === undefined,
  ).length;

  const merged = mergeModels(existingModels, allAIModels);

  const countMissingAfter = merged.filter(
    (m) => m.inputPricePerM === undefined || m.outputPricePerM === undefined,
  ).length;

  const newModelsFromAI = merged.length - existingModels.length;
  const pricesFilled = countMissingBefore - countMissingAfter;

  return {
    models: merged,
    aiEnriched: newModelsFromAI + pricesFilled,
  };
}
