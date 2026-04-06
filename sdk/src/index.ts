// 主类
export { Gateway } from "./gateway";

// 配置类型
export type { GatewayConfig, RetryConfig } from "./types/config";

// 请求类型
export type {
  ChatParams,
  ChatStreamParams,
  ImageParams,
  ModelsParams,
  Message,
  TextMessage,
  MultimodalMessage,
  ToolMessage,
  ContentPart,
  TextPart,
  ImagePart,
  ToolDefinition,
} from "./types/request";

// Action & Template 类型
export type { Action, ActionVersion, ActionMessage, ActionVariable } from "./types/action";
export type { Template, TemplateStep } from "./types/template";

// 响应类型
export type {
  ChatResponse,
  ChatStream,
  StreamChunk,
  ImageResponse,
  ModelInfo,
  Usage,
  ToolCall,
  ToolCallDelta,
  TokenPricing,
  CallPricing,
  RawChatResponse,
} from "./types/response";

// 错误类型
export {
  GatewayError,
  AuthError,
  InsufficientBalanceError,
  ModelNotFoundError,
  InvalidParameterError,
  RateLimitError,
  ProviderError,
  NoChannelError,
  ContentFilteredError,
  ConnectionError,
} from "./errors";
