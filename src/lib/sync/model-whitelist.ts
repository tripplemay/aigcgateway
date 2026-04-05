/**
 * 统一模型白名单
 *
 * 所有 provider 共用此白名单。key = provider name，value = Set<modelId>。
 * 白名单外的模型在同步时不入库，已有的会被 deleteMany 物理删除。
 *
 * 维护规则：
 *   - 每季度审查一次
 *   - 新模型上线后管理员手动添加
 *   - OpenRouter 使用浮动别名（不锁定版本）
 *   - SiliconFlow/Zhipu 只保留 TEXT/IMAGE 模型
 *
 * 最后审查：2026-04-05
 */

const WHITELIST: Record<string, Set<string>> = {
  openai: new Set([
    // Chat
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-4.1",
    "gpt-4.1-mini",
    "gpt-4.1-nano",
    "o3",
    "o3-mini",
    "o4-mini",
    // Image
    "dall-e-3",
    "gpt-image-1",
  ]),

  openrouter: new Set([
    // OpenAI
    "openai/gpt-4o",
    "openai/gpt-4o-mini",
    "openai/gpt-4-turbo",
    "openai/o1",
    "openai/o3-mini",
    "openai/o4-mini",
    // Google
    "google/gemini-2.5-pro",
    "google/gemini-2.5-flash",
    "google/gemini-2.0-flash-001",
    // Anthropic
    "anthropic/claude-3.5-sonnet",
    "anthropic/claude-3-haiku",
    // Meta
    "meta-llama/llama-3.3-70b-instruct",
    "meta-llama/llama-3.1-8b-instruct",
    // Mistral
    "mistralai/mistral-large",
    "mistralai/mixtral-8x22b-instruct",
    "mistralai/mistral-7b-instruct-v0.1",
    // xAI
    "x-ai/grok-3",
    "x-ai/grok-3-mini",
    // Reasoning
    "deepseek/deepseek-r1",
    "deepseek/deepseek-r1-distill-llama-70b",
    "qwen/qwq-32b",
    "qwen/qwen3-235b-a22b-thinking-2507",
    // Chat
    "deepseek/deepseek-chat-v3-0324",
    "qwen/qwen-plus-2025-07-28",
    "openai/gpt-3.5-turbo",
    // Search
    "perplexity/sonar",
    "perplexity/sonar-pro",
  ]),

  deepseek: new Set([
    "deepseek-chat",
    "deepseek-reasoner",
  ]),

  volcengine: new Set([
    "doubao-pro-32k",
    "doubao-lite-32k",
    "doubao-1.5-pro-32k",
    "doubao-vision-pro-32k",
    "doubao-pro-256k",
  ]),

  siliconflow: new Set([
    // Top text models
    "deepseek-ai/DeepSeek-V3",
    "deepseek-ai/DeepSeek-R1",
    "Qwen/Qwen2.5-72B-Instruct",
    "Qwen/QwQ-32B",
    "meta-llama/Llama-3.3-70B-Instruct",
    "THUDM/glm-4-9b-chat",
    // Image
    "black-forest-labs/FLUX.1-schnell",
    "stabilityai/stable-diffusion-3-5-large",
  ]),

  zhipu: new Set([
    "glm-4",
    "glm-4-plus",
    "glm-4-flash",
    "glm-4v",
    "glm-4v-flash",
    "cogview-3-flash",
    "cogview-3-plus",
    "cogview-4",
  ]),

  anthropic: new Set([
    "claude-3-5-sonnet-20241022",
    "claude-3-haiku-20240307",
    "claude-sonnet-4-20250514",
  ]),
};

/**
 * Check if a modelId is whitelisted for a given provider.
 * For providers not in the whitelist map, all models are allowed.
 */
export function isModelWhitelisted(providerName: string, modelId: string): boolean {
  const providerWhitelist = WHITELIST[providerName];
  if (!providerWhitelist) return true; // no whitelist = allow all
  return providerWhitelist.has(modelId);
}

/**
 * OpenAI uses prefix matching (e.g. "gpt-4o" matches "gpt-4o-2024-08-06")
 */
export function isOpenAIModelWhitelisted(modelId: string): boolean {
  const whitelist = WHITELIST.openai!;
  return (
    whitelist.has(modelId) ||
    [...whitelist].some(
      (prefix) => modelId.startsWith(`${prefix}-`) && !modelId.includes("realtime"),
    )
  );
}
