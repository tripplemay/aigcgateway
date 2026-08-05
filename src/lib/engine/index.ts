// BL-SEC-HOTFIX-2608 F-SH-03: routeByModelName 不再对外导出——它返回的 route 不含
// alias，承接用户流量会导致零计费并绕过停用开关与 modality 门禁（审查 C6）。
// 内部确需使用者请从 "./router" 直接引入，并确认该调用不参与计费。
export { resolveEngine, routeByAlias, getAdapterForRoute } from "./router";
export { withFailover, getAttemptChainFromError } from "./failover";
export type { AttemptRecord } from "./failover";
export { OpenAICompatEngine } from "./openai-compat";
export { VolcengineAdapter } from "./adapters/volcengine";
export { SiliconFlowAdapter } from "./adapters/siliconflow";
export { applyConfigOverlay, getQuirks } from "./config-overlay";
export { createSSEParser, createTextDecoderStream } from "./sse-parser";
export type {
  EngineAdapter,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
  ImageGenerationRequest,
  ImageGenerationResponse,
  RouteResult,
  RouteResultWithCandidates,
  ChatMessage,
  Usage,
} from "./types";
export { EngineError, ErrorCodes } from "./types";
