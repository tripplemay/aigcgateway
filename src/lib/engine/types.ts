import type { Provider, ProviderConfig, Channel, Model } from "@prisma/client";

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
  stream?: boolean;
  n?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  response_format?: { type: string };
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
 * - Email addresses
 * - IP addresses
 */
export function sanitizeErrorMessage(message: string): string {
  let sanitized = message;
  // Remove URLs
  sanitized = sanitized.replace(/https?:\/\/[^\s"'<>,;)}\]]+/gi, "[URL removed]");
  // Remove API Key fragments (sk-xxx, sk_xxx, pk-xxx, pk_xxx, key_xxx, Bearer xxx)
  sanitized = sanitized.replace(/\b(sk[-_]|pk[-_]|key[-_])[a-zA-Z0-9_-]{4,}/gi, "[key removed]");
  sanitized = sanitized.replace(/Bearer\s+[a-zA-Z0-9_.-]{8,}/gi, "Bearer [redacted]");
  // Remove QQ group numbers
  sanitized = sanitized.replace(/(QQ群?|加群|群号)[：:\s]*\d{5,}/gi, "[contact removed]");
  // Remove email addresses
  sanitized = sanitized.replace(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    "[email removed]",
  );
  // Remove IP addresses (v4)
  sanitized = sanitized.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?\b/g, "[IP removed]");
  return sanitized;
}

export const ErrorCodes = {
  INVALID_REQUEST: "invalid_request",
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
