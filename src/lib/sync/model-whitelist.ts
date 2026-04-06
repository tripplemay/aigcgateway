/**
 * 统一模型白名单 — 28 个精选模型
 *
 * 从"我们已接入什么"转变为"开发者需要什么"。
 * key = provider name，value = Set<modelId>（服务商原始 ID）。
 * 白名单外的模型在同步时不入库，已有的 deleteMany 物理删除。
 *
 * 部分模型通过 OpenRouter 代理接入（Kimi、MiniMax、Perplexity、Gemini 等）。
 *
 * 最后审查：2026-04-06
 */

const WHITELIST: Record<string, Set<string>> = {
  openai: new Set([
    // 旗舰对话
    "gpt-4o",
    "gpt-4o-mini",
    // 推理
    "o3",
    "o4-mini",
    // 图片
    "dall-e-3",
    "gpt-image-1",
  ]),

  openrouter: new Set([
    // 旗舰对话（通过 OpenRouter 代理）
    "google/gemini-2.5-pro",
    "google/gemini-2.5-flash",
    "google/gemini-2.0-flash-001",
    "google/gemini-1.5-pro",
    "anthropic/claude-sonnet-4",
    "anthropic/claude-3.5-haiku",
    "x-ai/grok-3",
    "x-ai/grok-3-mini",
    "moonshotai/kimi-k2",
    "minimax/minimax-01",
    "qwen/qwen-max",
    "qwen/qwen-plus",
    // 推理
    "deepseek/deepseek-r1",
    // 搜索增强
    "perplexity/sonar",
    "perplexity/sonar-pro",
  ]),

  deepseek: new Set(["deepseek-chat", "deepseek-reasoner"]),

  volcengine: new Set([
    "doubao-pro-32k",
    "doubao-vision-pro-32k",
    "doubao-pro-256k",
    "seedream-4.5",
  ]),

  siliconflow: new Set([
    // 通义万相（阿里图片模型）
    "Qwen/Wanx",
  ]),

  zhipu: new Set(["glm-4-plus", "glm-4-flash"]),

  anthropic: new Set(["claude-sonnet-4-20250514", "claude-3-5-haiku-20241022"]),
};

/**
 * Check if a modelId is whitelisted for a given provider.
 * For providers not in the whitelist map, all models are allowed.
 */
export function isModelWhitelisted(providerName: string, modelId: string): boolean {
  const providerWhitelist = WHITELIST[providerName];
  if (!providerWhitelist) return true;
  return providerWhitelist.has(modelId);
}

/**
 * OpenAI uses exact matching (no more prefix matching).
 */
export function isOpenAIModelWhitelisted(modelId: string): boolean {
  const whitelist = WHITELIST.openai!;
  return whitelist.has(modelId);
}

/**
 * Build the complete set of canonical Model names that should exist in the database.
 * This combines all provider whitelists with their name resolution rules:
 * - openrouter models: check CROSS_PROVIDER_MAP first, then "openrouter/{modelId}"
 * - other providers: "{providerName}/{modelId}"
 */
export function getAllWhitelistedModelNames(crossProviderMap: Record<string, string>): Set<string> {
  const names = new Set<string>();

  for (const [providerName, modelIds] of Object.entries(WHITELIST)) {
    for (const modelId of modelIds) {
      if (providerName === "openrouter") {
        const mapped = crossProviderMap[modelId];
        names.add(mapped ?? `openrouter/${modelId}`);
      } else {
        names.add(`${providerName}/${modelId}`);
      }
    }
  }

  return names;
}
