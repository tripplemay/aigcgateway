/**
 * 模型 capabilities 静态 fallback 映射
 *
 * 只标当前 MCP 实际支持的能力：streaming、vision、json_mode
 * 不标 function_calling / tools（当前 MCP chat 不支持传 tools 参数）
 *
 * 覆盖 28 个白名单精选模型。
 */

export interface ModelCapabilities {
  vision?: boolean;
  json_mode?: boolean;
  streaming?: boolean;
  unknown?: boolean;
}

const CAPABILITIES_MAP: Record<string, ModelCapabilities> = {
  // ── 通用对话（旗舰）──
  "gpt-4o": { vision: true, json_mode: true, streaming: true },
  "claude-sonnet-4": { vision: true, json_mode: true, streaming: true },
  "gemini-2.5-pro": { vision: true, json_mode: true, streaming: true },
  "deepseek-chat": { json_mode: true, streaming: true },
  "deepseek/deepseek-chat": { json_mode: true, streaming: true },
  "grok-3": { json_mode: true, streaming: true },
  "qwen-plus": { json_mode: true, streaming: true },
  "qwen/qwen-plus": { json_mode: true, streaming: true },
  "glm-4-plus": { json_mode: true, streaming: true },
  "glm-4": { json_mode: true, streaming: true },
  kimi: { streaming: true },
  "moonshotai/kimi": { streaming: true },

  // ── 轻量/高速 ──
  "gpt-4o-mini": { vision: true, json_mode: true, streaming: true },
  "gemini-2.5-flash": { vision: true, json_mode: true, streaming: true },
  "gemini-2.0-flash": { vision: true, json_mode: true, streaming: true },
  "claude-3.5-haiku": { vision: true, streaming: true },
  "claude-3-5-haiku": { vision: true, streaming: true },
  "grok-3-mini": { json_mode: true, streaming: true },
  "glm-4-flash": { json_mode: true, streaming: true },
  "minimax-01": { streaming: true },
  "minimax/minimax-01": { streaming: true },

  // ── 长上下文 ──
  "gemini-1.5-pro": { vision: true, json_mode: true, streaming: true },
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
  "qwen-max": { json_mode: true, streaming: true },
  "qwen/qwen-max": { json_mode: true, streaming: true },

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
 * Resolve capabilities for a model by matching its ID against known keys.
 * Tries exact match first, then prefix match (longest prefix wins).
 * Returns { unknown: true } if no match found.
 */
export function resolveCapabilities(modelId: string): ModelCapabilities {
  // Exact match
  if (modelId in CAPABILITIES_MAP) {
    return { ...CAPABILITIES_MAP[modelId], unknown: false };
  }

  // Prefix match (longest prefix wins)
  const matches = Object.entries(CAPABILITIES_MAP)
    .filter(([prefix]) => modelId.startsWith(prefix))
    .sort((a, b) => b[0].length - a[0].length);

  if (matches.length > 0) {
    return { ...matches[0][1], unknown: false };
  }

  return { unknown: true };
}
