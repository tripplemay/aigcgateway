/**
 * 模型 capabilities 静态 fallback 映射
 *
 * 当上游 API 不返回 capability 信息时使用此映射。
 * Key = 模型名前缀（匹配 modelId.startsWith(key)）
 */

export interface ModelCapabilities {
  vision?: boolean;
  function_calling?: boolean;
  json_mode?: boolean;
  streaming?: boolean;
  unknown?: boolean;
}

const CAPABILITIES_MAP: Record<string, ModelCapabilities> = {
  // OpenAI
  "gpt-4o": { vision: true, function_calling: true, json_mode: true, streaming: true },
  "gpt-4.1": { vision: true, function_calling: true, json_mode: true, streaming: true },
  "o3": { function_calling: true, json_mode: true, streaming: true },
  "o4-mini": { function_calling: true, json_mode: true, streaming: true },
  "dall-e": { streaming: false },
  "gpt-image": { streaming: false },

  // DeepSeek
  "deepseek-chat": { function_calling: true, json_mode: true, streaming: true },
  "deepseek-reasoner": { streaming: true },

  // Zhipu
  "glm-4v": { vision: true, function_calling: true, streaming: true },
  "glm-4": { function_calling: true, json_mode: true, streaming: true },
  "cogview": { streaming: false },

  // Volcengine
  "doubao-vision": { vision: true, streaming: true },
  "doubao": { function_calling: true, streaming: true },

  // Anthropic
  "claude": { vision: true, function_calling: true, json_mode: true, streaming: true },

  // Meta (via OpenRouter/SiliconFlow)
  "llama": { streaming: true },
  "Llama": { streaming: true },

  // Qwen
  "qwen": { function_calling: true, streaming: true },
  "Qwen": { function_calling: true, streaming: true },
  "qwq": { streaming: true },
  "QwQ": { streaming: true },

  // Mistral
  "mistral": { function_calling: true, json_mode: true, streaming: true },
  "mixtral": { function_calling: true, streaming: true },

  // xAI
  "grok": { function_calling: true, streaming: true },

  // Image models
  "FLUX": { streaming: false },
  "stable-diffusion": { streaming: false },
};

/**
 * Resolve capabilities for a model by matching its ID against known prefixes.
 * Returns { unknown: true } if no match found.
 */
export function resolveCapabilities(modelId: string): ModelCapabilities {
  // Try exact match first, then prefix match (longest prefix wins)
  const matches = Object.entries(CAPABILITIES_MAP)
    .filter(([prefix]) => modelId.startsWith(prefix))
    .sort((a, b) => b[0].length - a[0].length);

  if (matches.length > 0) {
    return { ...matches[0][1], unknown: false };
  }

  return { unknown: true };
}
