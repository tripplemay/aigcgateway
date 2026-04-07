/**
 * 模型 capabilities 静态 fallback 映射
 *
 * 标注 MCP 实际支持的能力：streaming、vision、json_mode、function_calling
 * 覆盖 28 个白名单精选模型。
 */

export interface ModelCapabilities {
  vision?: boolean;
  json_mode?: boolean;
  streaming?: boolean;
  function_calling?: boolean;
}

const CAPABILITIES_MAP: Record<string, ModelCapabilities> = {
  // ── 通用对话（旗舰）──
  "gpt-4o": { vision: true, json_mode: true, streaming: true, function_calling: true },
  "claude-sonnet-4": { vision: true, json_mode: true, streaming: true, function_calling: true },
  "gemini-2.5-pro": { vision: true, json_mode: true, streaming: true, function_calling: true },
  "deepseek-chat": { json_mode: true, streaming: true, function_calling: true },
  "deepseek/deepseek-chat": { json_mode: true, streaming: true, function_calling: true },
  "grok-3": { json_mode: true, streaming: true, function_calling: true },
  "qwen-plus": { json_mode: true, streaming: true, function_calling: true },
  "qwen/qwen-plus": { json_mode: true, streaming: true, function_calling: true },
  "glm-4-plus": { json_mode: true, streaming: true, function_calling: true },
  "glm-4": { json_mode: true, streaming: true, function_calling: true },
  kimi: { streaming: true },
  "moonshotai/kimi": { streaming: true },

  // ── 轻量/高速 ──
  "gpt-4o-mini": { vision: true, json_mode: true, streaming: true, function_calling: true },
  "gemini-2.5-flash": { vision: true, json_mode: true, streaming: true, function_calling: true },
  "gemini-2.0-flash": { vision: true, json_mode: true, streaming: true, function_calling: true },
  "claude-3.5-haiku": { vision: true, streaming: true, function_calling: true },
  "claude-3-5-haiku": { vision: true, streaming: true, function_calling: true },
  "grok-3-mini": { json_mode: true, streaming: true, function_calling: true },
  "glm-4-flash": { json_mode: true, streaming: true, function_calling: true },
  "minimax-01": { streaming: true },
  "minimax/minimax-01": { streaming: true },

  // ── 长上下文 ──
  "gemini-1.5-pro": { vision: true, json_mode: true, streaming: true, function_calling: true },
  "doubao-pro-256k": { streaming: true },

  // ── 推理 ──
  o3: { json_mode: true, streaming: true },
  "o4-mini": { json_mode: true, streaming: true },
  "deepseek-reasoner": { streaming: true },
  "deepseek-r1": { streaming: true },
  "deepseek/deepseek-r1": { streaming: true },

  // ── 搜索增强 ──
  "perplexity/sonar": { streaming: true },
  "perplexity/sonar-pro": { streaming: true },

  // ── 阿里旗舰 ──
  "qwen-max": { json_mode: true, streaming: true, function_calling: true },
  "qwen/qwen-max": { json_mode: true, streaming: true, function_calling: true },

  // ── 多模态视觉 ──
  "doubao-vision-pro-32k": { vision: true, streaming: true },
  "doubao-vision": { vision: true, streaming: true },

  // ── 图片生成 ──
  "gpt-image-1": { streaming: false },
  "dall-e-3": { streaming: false },
  "dall-e": { streaming: false },
  "Qwen/Wanx": { streaming: false },
  "seedream-4.5": { streaming: false },
  cogview: { streaming: false },
};

/**
 * contextWindow fallback 映射（单位：tokens）
 * 优先使用 provider 返回值，此处仅补缺。
 */
const CONTEXT_WINDOW_MAP: Record<string, number> = {
  // ── 通用对话（旗舰）──
  "gpt-4o": 128000,
  "claude-sonnet-4": 200000,
  "gemini-2.5-pro": 1048576,
  "deepseek-chat": 64000,
  "deepseek/deepseek-chat": 64000,
  "grok-3": 131072,
  "qwen-plus": 131072,
  "qwen/qwen-plus": 131072,
  "glm-4-plus": 128000,
  "glm-4": 128000,
  kimi: 128000,
  "moonshotai/kimi": 128000,

  // ── 轻量/高速 ──
  "gpt-4o-mini": 128000,
  "gemini-2.5-flash": 1048576,
  "gemini-2.0-flash": 1048576,
  "claude-3.5-haiku": 200000,
  "claude-3-5-haiku": 200000,
  "grok-3-mini": 131072,
  "glm-4-flash": 128000,
  "minimax-01": 1000000,
  "minimax/minimax-01": 1000000,

  // ── 长上下文 ──
  "gemini-1.5-pro": 2097152,
  "doubao-pro-256k": 256000,

  // ── 推理 ──
  o3: 200000,
  "o4-mini": 200000,
  "deepseek-reasoner": 64000,
  "deepseek-r1": 64000,
  "deepseek/deepseek-r1": 64000,

  // ── 搜索增强 ──
  "perplexity/sonar": 127072,
  "perplexity/sonar-pro": 127072,

  // ── 阿里旗舰 ──
  "qwen-max": 32768,
  "qwen/qwen-max": 32768,

  // ── 多模态视觉 ──
  "doubao-vision-pro-32k": 32000,
  "doubao-vision": 12288,
};

/**
 * Resolve capabilities for a model by matching its ID against known keys.
 * Tries exact match first, then prefix match (longest prefix wins).
 * Returns {} if no match found.
 */
export function resolveCapabilities(modelId: string): ModelCapabilities {
  // Exact match
  if (modelId in CAPABILITIES_MAP) {
    return { ...CAPABILITIES_MAP[modelId] };
  }

  // Prefix match (longest prefix wins)
  const matches = Object.entries(CAPABILITIES_MAP)
    .filter(([prefix]) => modelId.startsWith(prefix))
    .sort((a, b) => b[0].length - a[0].length);

  if (matches.length > 0) {
    return { ...matches[0][1] };
  }

  return {};
}

/**
 * Resolve contextWindow for a model. Returns null if unknown.
 */
export function resolveContextWindow(modelId: string): number | null {
  if (modelId in CONTEXT_WINDOW_MAP) {
    return CONTEXT_WINDOW_MAP[modelId];
  }

  const matches = Object.entries(CONTEXT_WINDOW_MAP)
    .filter(([prefix]) => modelId.startsWith(prefix))
    .sort((a, b) => b[0].length - a[0].length);

  if (matches.length > 0) {
    return matches[0][1];
  }

  return null;
}

/**
 * Supported image sizes per model (static mapping).
 */
const SUPPORTED_SIZES_MAP: Record<string, string[]> = {
  "dall-e-3": ["1024x1024", "1024x1792", "1792x1024"],
  "dall-e": ["256x256", "512x512", "1024x1024"],
  "gpt-image-1": ["1024x1024", "1024x1536", "1536x1024", "auto"],
  "seedream-4.5": ["1024x1024", "960x1280", "1280x960", "720x1440", "1440x720"],
  "seedream": ["1024x1024", "960x1280", "1280x960"],
  cogview: ["1024x1024"],
  "Qwen/Wanx": ["1024x1024", "720x1280", "1280x720"],
};

/**
 * Resolve supported image sizes for a model. Returns null if not an image model.
 */
export function resolveSupportedSizes(modelId: string): string[] | null {
  if (modelId in SUPPORTED_SIZES_MAP) {
    return SUPPORTED_SIZES_MAP[modelId];
  }

  const matches = Object.entries(SUPPORTED_SIZES_MAP)
    .filter(([prefix]) => modelId.startsWith(prefix))
    .sort((a, b) => b[0].length - a[0].length);

  if (matches.length > 0) {
    return matches[0][1];
  }

  return null;
}
