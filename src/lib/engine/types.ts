import type { Provider, ProviderConfig, Channel, Model, ModelAlias } from "@prisma/client";

// ============================================================
// 请求类型
// ============================================================

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ChatContentPart[];
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ChatContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string; detail?: "auto" | "low" | "high" };
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  /**
   * 独立控制 reasoning 模型的 thinking token 上限。
   * - OpenAI o1/o3 会映射为 `reasoning_effort` + 内部 budget
   * - Anthropic extended thinking 映射为 `thinking.budget_tokens`
   * - DeepSeek R1 / Zhipu GLM-4 Thinking 映射为 `reasoning.max_tokens`
   */
  max_reasoning_tokens?: number;
  stream?: boolean;
  n?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  response_format?: { type: string };
  stop?: string | string[];
  tools?: unknown[];
  tool_choice?: unknown;
  stream_options?: { include_usage?: boolean };
}

export interface ImageGenerationRequest {
  model: string;
  prompt: string;
  n?: number;
  size?: string;
  quality?: string;
  response_format?: "url" | "b64_json";
}

// ============================================================
// 响应类型（标准化后）
// ============================================================

export interface ChatCompletionResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: ChatChoice[];
  usage: Usage | null;
}

export interface ChatChoice {
  index: number;
  message: { role: "assistant"; content: string | null; tool_calls?: ToolCall[] };
  finish_reason: string | null;
}

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  /**
   * 仅 reasoning 模型返回。thinking/reasoning 阶段消耗的 token 数。
   * 与 completion_tokens 分开计量，便于用户理解成本构成。
   * 来源：上游 usage.completion_tokens_details.reasoning_tokens
   */
  reasoning_tokens?: number;
}

export interface ChatCompletionChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: StreamChoice[];
  usage?: Usage | null;
}

export interface StreamChoice {
  index: number;
  delta: { role?: string; content?: string; tool_calls?: ToolCall[] };
  finish_reason: string | null;
}

export interface ImageGenerationResponse {
  created: number;
  data: ImageData[];
}

export interface ImageData {
  url?: string;
  b64_json?: string;
  revised_prompt?: string;
}

// ============================================================
// 错误类型
// ============================================================

export class EngineError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number,
    public readonly providerError?: unknown,
  ) {
    super(message);
    this.name = "EngineError";
  }
}

/**
 * Sanitize upstream provider error messages to remove sensitive information:
 * - URLs (http/https)
 * - API Key fragments (sk-*, pk-*, key_*, Bearer tokens)
 * - QQ group numbers (QQ群:xxx / 加群xxx)
 * - WeChat groups (微信群 / 加微信 / wx:xxx)
 * - Phone numbers (Chinese mobile / customer service hotlines)
 * - Email addresses
 * - IP addresses
 * - Upstream-specific terminology (plugin names, internal features)
 */
export function sanitizeErrorMessage(message: string): string {
  let sanitized = message;
  // Remove URLs
  sanitized = sanitized.replace(/https?:\/\/[^\s"'<>,;)}\]]+/gi, "[URL removed]");
  // Remove API Key fragments (sk-xxx, sk_xxx, pk-xxx, pk_xxx, key_xxx, Bearer xxx)
  // F-AF-01: include `*` in the char class so masked leaks like `sk-B2n****zjvw`
  // (mid-key asterisks left by upstream providers) are also redacted. We also
  // drop the {4,} floor for the mask variant — any sk-/pk-/key- followed by
  // mixed alphanum/mask chars must go.
  sanitized = sanitized.replace(/\b(sk[-_]|pk[-_]|key[-_])[a-zA-Z0-9*_-]{3,}/gi, "[key removed]");
  // Catch OpenAI/OpenRouter/Anthropic style prefixes that survived the first
  // pass (e.g. `sk-proj-`, `sk-or-v1-`, `sk-ant-`) regardless of word boundary.
  sanitized = sanitized.replace(/sk-[a-zA-Z0-9*_-]{6,}/gi, "[key removed]");
  sanitized = sanitized.replace(/Bearer\s+[a-zA-Z0-9_.*-]{6,}/gi, "Bearer [redacted]");
  // Remove QQ group numbers (QQ群:836739524, 加群836739524, 群号 836739524)
  sanitized = sanitized.replace(/(QQ群?|加群|群号)[：:\s]*\d{5,}/gi, "[contact removed]");
  // Remove WeChat contact info (微信群, 加微信, wx:xxx, WeChat:xxx)
  sanitized = sanitized.replace(
    /(微信群?|加微信|wx|wechat)[：:\s]*[a-zA-Z0-9_-]*/gi,
    "[contact removed]",
  );
  // Remove phone numbers (Chinese mobile: 1xx-xxxx-xxxx, service hotlines: 400/800-xxx-xxxx)
  sanitized = sanitized.replace(/\b1[3-9]\d[\s-]?\d{4}[\s-]?\d{4}\b/g, "[contact removed]");
  sanitized = sanitized.replace(/\b[48]00[\s-]?\d{3,4}[\s-]?\d{4}\b/g, "[contact removed]");
  // Remove customer service / contact invitation sentences (如果您遇到问题...加入...咨询)
  sanitized = sanitized.replace(/【[^】]*(?:客服|咨询|加入|联系|群)[^】]*】/g, "[contact removed]");
  sanitized = sanitized.replace(
    /(?:如果您?|若您?)(?:遇到|有)[^。.]*(?:咨询|联系|加入)[^。.]*/g,
    "[contact removed]",
  );
  // Remove email addresses
  sanitized = sanitized.replace(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    "[email removed]",
  );
  // Remove IP addresses (v4)
  sanitized = sanitized.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?\b/g, "[IP removed]");
  // Remove Request IDs (Request ID xxx, RequestId: xxx, req-xxx patterns)
  sanitized = sanitized.replace(/Request\s*ID[:\s]+[a-zA-Z0-9_-]+/gi, "[rid removed]");
  sanitized = sanitized.replace(/\breq-[a-zA-Z0-9_-]{4,}/gi, "[rid removed]");
  // Remove provider endpoint/region info (endpoint xxx/region, cn-xxx, us-xxx-N)
  sanitized = sanitized.replace(/endpoint\s+[a-zA-Z0-9/._-]+/gi, "[infra removed]");
  sanitized = sanitized.replace(/\b[a-z]{2}-[a-z]+-\d+\b/g, "[infra removed]");
  // Remove upstream-specific terminology (plugin names, internal feature names)
  sanitized = sanitized.replace(/\bcontext[- ]?compression\s+plugin\b/gi, "[upstream feature]");
  sanitized = sanitized.replace(/\bweb[- ]?search\s+plugin\b/gi, "[upstream feature]");
  sanitized = sanitized.replace(/\blong[- ]?context\s+plugin\b/gi, "[upstream feature]");

  // F-ACF-08 — strip English leakage terms and upstream routing hints.
  // Rewrite unfriendly phrasing FIRST so subsequent "via chat" stripping
  // doesn't eat the helpful replacement sentence.
  sanitized = sanitized.replace(
    /via (?:chat|completions|responses)\s+returned no extractable image/gi,
    "did not return a valid image",
  );
  sanitized = sanitized.replace(/returned no extractable image/gi, "did not return a valid image");
  sanitized = sanitized.replace(/\bupstream feature\b/gi, "[feature removed]");
  // Drop any remaining "via chat|completions|responses" routing hints.
  sanitized = sanitized.replace(
    /\bvia (?:chat|completions|responses)\b[^.]*\./gi,
    "[upstream call removed].",
  );
  sanitized = sanitized.replace(
    /\bvia (?:chat|completions|responses)\b[^,.]*/gi,
    "[upstream call removed]",
  );
  sanitized = sanitized.replace(
    /\bThis endpoint\b[^.]*\./gi,
    "[upstream endpoint description removed].",
  );
  sanitized = sanitized.replace(/\bendpoint'?s? maximum\b[^.]*\./gi, "[upstream limit removed].");
  // Content preview sentences — drop the whole sentence containing the preview.
  sanitized = sanitized.replace(/[^.]*Content preview[^.]*\.?/gi, "");

  // F-AF2-03: clean up internal placeholder tokens so they never leak to users.
  // If the message contains [infra removed], the whole sentence is replaced with
  // a user-friendly message since the infrastructure detail was the key info.
  if (sanitized.includes("[infra removed]")) {
    sanitized = "Model unavailable, please try list_models to find alternatives";
  } else {
    // Remove other placeholders that don't carry essential meaning
    sanitized = sanitized.replace(/\[contact removed\]/g, "");
    sanitized = sanitized.replace(/\[upstream preview removed\]/g, "");
    sanitized = sanitized.replace(/\[rid removed\]/g, "");
    sanitized = sanitized.replace(/\[upstream endpoint description removed\]\.?/g, "");
    sanitized = sanitized.replace(/\[upstream limit removed\]\.?/g, "");
    sanitized = sanitized.replace(/\[upstream call removed\]\.?/g, "");
    sanitized = sanitized.replace(/\[upstream feature\]/g, "");
    sanitized = sanitized.replace(/\[feature removed\]/g, "");
  }

  // Collapse consecutive whitespace / punctuation the substitutions may have introduced.
  sanitized = sanitized.replace(/[,;]\s*[,.;]/g, "."); // ",." → "."
  sanitized = sanitized.replace(/\.\s*\./g, "."); // ".." → "."
  sanitized = sanitized.replace(/\s{2,}/g, " ").trim();
  // Remove leading/trailing punctuation
  sanitized = sanitized.replace(/^[,;.\s]+/, "").replace(/[,;\s]+$/, "");
  return sanitized || "An error occurred";
}

export const ErrorCodes = {
  INVALID_REQUEST: "invalid_request",
  INVALID_SIZE: "invalid_size",
  AUTH_FAILED: "auth_failed",
  RATE_LIMITED: "rate_limited",
  MODEL_NOT_FOUND: "model_not_found",
  MODEL_NOT_AVAILABLE: "model_not_available",
  CHANNEL_UNAVAILABLE: "channel_unavailable",
  CONTENT_FILTERED: "content_filtered",
  INSUFFICIENT_BALANCE: "insufficient_balance",
  PROVIDER_ERROR: "provider_error",
  TIMEOUT: "timeout",
} as const;

// ============================================================
// 路由结果
// ============================================================

export interface RouteResult {
  channel: Channel;
  provider: Provider;
  config: ProviderConfig;
  model: Model;
  alias?: ModelAlias | null;
}

// ============================================================
// Adapter 接口
// ============================================================

export interface EngineAdapter {
  chatCompletions(
    request: ChatCompletionRequest,
    route: RouteResult,
  ): Promise<ChatCompletionResponse>;

  chatCompletionsStream(
    request: ChatCompletionRequest,
    route: RouteResult,
  ): Promise<ReadableStream<ChatCompletionChunk>>;

  imageGenerations(
    request: ImageGenerationRequest,
    route: RouteResult,
  ): Promise<ImageGenerationResponse>;
}

// ============================================================
// quirks 标记
// ============================================================

export type Quirk =
  | "temperature_open_interval"
  | "no_response_format"
  | "no_penalty_params"
  | "n_must_be_1"
  | "base_url_trailing_slash"
  | "has_reasoning_content"
  | "has_cache_hit_tokens"
  | "sse_keepalive_comments"
  | "image_prefer_chat"
  | "image_response_format_diff"
  | "model_id_has_org_prefix"
  | "model_can_be_endpoint_id"
  | "multi_size_retry"
  | "no_charge_on_image_failure"
  | "models_api_has_pricing"
  | "image_via_chat_modalities"
  | "sse_openrouter_comments";
