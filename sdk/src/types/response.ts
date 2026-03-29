export interface ChatResponse {
  content: string;
  traceId: string;
  finishReason: "stop" | "length" | "tool_calls" | "content_filter";
  usage: Usage;
  toolCalls?: ToolCall[];
  raw: RawChatResponse;
}

export interface StreamChunk {
  content: string;
  finishReason: string | null;
  toolCalls?: ToolCallDelta[];
}

export interface ChatStream extends AsyncIterable<StreamChunk> {
  traceId: string;
  usage: Usage | null;
  abort(): void;
  collect(): Promise<ChatResponse>;
}

export interface Usage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ImageResponse {
  url?: string;
  b64Json?: string;
  revisedPrompt?: string;
  traceId: string;
}

export interface ModelInfo {
  id: string;
  displayName: string;
  modality: "text" | "image";
  contextWindow?: number;
  maxOutputTokens?: number;
  pricing: TokenPricing | CallPricing;
  capabilities?: {
    vision?: boolean;
    tools?: boolean;
    streaming?: boolean;
    jsonMode?: boolean;
  };
}

export interface TokenPricing {
  unit: "token";
  inputPer1M: number;
  outputPer1M: number;
  currency: "USD";
}

export interface CallPricing {
  unit: "call";
  perCall: number;
  currency: "USD";
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ToolCallDelta {
  index: number;
  id?: string;
  type?: "function";
  function?: { name?: string; arguments?: string };
}

export interface RawChatResponse {
  id: string;
  object: string;
  model: string;
  created: number;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: ToolCall[];
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
