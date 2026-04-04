/**
 * OpenRouter 模型白名单
 *
 * 只同步此列表中的模型，避免全量同步带来的健康检查和 doc-enricher 成本爆炸。
 *
 * 维护规则：
 *   - 优先使用浮动别名（如 openai/gpt-4o），不锁定版本快照
 *   - 版本快照仅在有合规锁定需求时才加入
 *   - 建议每季度核对一次，检查是否有旗舰新版上线或旧版下线
 *   - 参考：https://openrouter.ai/models
 *
 * 最后审查：2026-04-04
 */

export const OPENROUTER_MODEL_WHITELIST = new Set([
  // ──────────────────────────────────────────────
  // 旗舰对话模型（浮动别名，自动跟随最新版本）
  // ──────────────────────────────────────────────

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

  // Anthropic（OpenRouter 作为备用路由）
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

  // ──────────────────────────────────────────────
  // 推理 / 思维链
  // ──────────────────────────────────────────────

  "deepseek/deepseek-r1",
  "deepseek/deepseek-r1-distill-llama-70b",
  "qwen/qwq-32b",
  "qwen/qwen3-235b-a22b-thinking-2507",

  // ──────────────────────────────────────────────
  // 日常对话 / 编程
  // ──────────────────────────────────────────────

  "deepseek/deepseek-chat-v3-0324",
  "qwen/qwen-plus-2025-07-28",
  "openai/gpt-3.5-turbo",

  // ──────────────────────────────────────────────
  // 搜索增强（含联网能力）
  // ──────────────────────────────────────────────

  "perplexity/sonar",
  "perplexity/sonar-pro",

  // ──────────────────────────────────────────────
  // 图片生成 — 已从 OpenRouter 白名单移除（2026-04-04）
  // 原因：OpenRouter 图片模型走 chat 端点，频繁返回空 content，
  //       生产验证 gemini-2.5-flash-image / gpt-5-image-mini 均 FAIL。
  //       图片生成由直连 Provider（OpenAI dall-e-3、zhipu、volcengine）承担。
  // ──────────────────────────────────────────────
]);
