import type { GatewayConfig } from "./types/config";
import type {
  ChatParams,
  ChatStreamParams,
  ImageParams,
  ModelsParams,
} from "./types/request";
import type {
  ChatResponse,
  ChatStream,
  ImageResponse,
  ModelInfo,
  RawChatResponse,
  TokenPricing,
  CallPricing,
} from "./types/response";
import { ChatStreamImpl } from "./stream";
import { fetchWithRetry } from "./retry";
import { ConnectionError, mapResponseToError } from "./errors";

export class Gateway {
  private config: Required<Pick<GatewayConfig, "apiKey" | "baseUrl" | "timeout">> &
    GatewayConfig;
  private fetchFn: typeof fetch;

  constructor(config: GatewayConfig) {
    if (!config.apiKey) throw new Error("apiKey is required");

    this.config = {
      ...config,
      baseUrl: (config.baseUrl ?? "").replace(/\/+$/, ""),
      timeout: config.timeout ?? 30000,
    };
    this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
  }

  // ==============================================================
  // chat — overloaded
  // ==============================================================

  async chat(params: ChatParams): Promise<ChatResponse>;
  async chat(params: ChatStreamParams): Promise<ChatStream>;
  async chat(
    params: ChatParams | ChatStreamParams,
  ): Promise<ChatResponse | ChatStream> {
    if ("stream" in params && params.stream === true) {
      return this.chatStream(params);
    }
    return this.chatNonStream(params as ChatParams);
  }

  // ==============================================================
  // image
  // ==============================================================

  async image(params: ImageParams): Promise<ImageResponse> {
    const response = await this.request(
      "/v1/images/generations",
      "POST",
      params,
      params.model,
    );

    const traceId = this.extractTraceId(response);
    const body = (await response.json()) as { data?: Array<Record<string, unknown>> };
    const first = body.data?.[0] ?? {};

    return {
      url: first.url as string | undefined,
      b64Json: first.b64_json as string | undefined,
      revisedPrompt: first.revised_prompt as string | undefined,
      traceId,
    };
  }

  // ==============================================================
  // models
  // ==============================================================

  async models(params?: ModelsParams): Promise<ModelInfo[]> {
    const query = params?.modality ? `?modality=${params.modality}` : "";
    const response = await this.request(
      `/v1/models${query}`,
      "GET",
    );

    const body = (await response.json()) as { data?: Record<string, unknown>[] };
    const data = body.data ?? [];

    return data.map(
      (m: Record<string, unknown>) => ({
        id: m.id as string,
        displayName: (m.display_name ?? m.id) as string,
        modality: (m.modality ?? "text") as "text" | "image",
        contextWindow: m.context_window as number | undefined,
        maxOutputTokens: m.max_output_tokens as number | undefined,
        pricing: mapPricing(m.pricing as Record<string, unknown>),
        capabilities: m.capabilities as ModelInfo["capabilities"],
      }),
    );
  }

  // ==============================================================
  // Private: non-stream chat
  // ==============================================================

  private async chatNonStream(params: ChatParams): Promise<ChatResponse> {
    const body = { ...params, stream: false };
    const response = await this.request(
      "/v1/chat/completions",
      "POST",
      body,
      params.model,
    );

    const traceId = this.extractTraceId(response);
    const raw = (await response.json()) as RawChatResponse;

    // Also try traceId from body
    const finalTraceId = traceId || raw.id?.replace("chatcmpl-", "") || "";

    const choice = raw.choices?.[0];
    const usage = raw.usage;

    return {
      content: choice?.message?.content ?? "",
      traceId: finalTraceId,
      finishReason: (choice?.finish_reason ?? "stop") as ChatResponse["finishReason"],
      usage: {
        promptTokens: usage?.prompt_tokens ?? 0,
        completionTokens: usage?.completion_tokens ?? 0,
        totalTokens: usage?.total_tokens ?? 0,
      },
      toolCalls: choice?.message?.tool_calls,
      raw,
    };
  }

  // ==============================================================
  // Private: stream chat
  // ==============================================================

  private async chatStream(params: ChatStreamParams): Promise<ChatStream> {
    const body = {
      ...params,
      stream: true,
      stream_options: { include_usage: true },
    };

    const abortController = new AbortController();
    const timeoutId = setTimeout(
      () => abortController.abort(),
      this.config.timeout,
    );

    try {
      const response = await fetchWithRetry({
        config: this.config.retry ?? {},
        fetchFn: this.fetchFn,
        url: `${this.config.baseUrl}/v1/chat/completions`,
        init: {
          method: "POST",
          headers: this.buildHeaders(),
          body: JSON.stringify(body),
          signal: abortController.signal,
        },
        requestModel: params.model,
        isStream: true,
      });

      clearTimeout(timeoutId);

      if (!response.body) {
        throw new ConnectionError("No response body for stream", "network");
      }

      return new ChatStreamImpl(response, abortController);
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  }

  // ==============================================================
  // Private: request helper
  // ==============================================================

  private async request(
    path: string,
    method: "GET" | "POST",
    body?: unknown,
    requestModel?: string,
  ): Promise<Response> {
    const url = `${this.config.baseUrl}${path}`;

    const abortController = new AbortController();
    const timeoutId = setTimeout(
      () => abortController.abort(),
      this.config.timeout,
    );

    try {
      const response = await fetchWithRetry({
        config: this.config.retry ?? {},
        fetchFn: this.fetchFn,
        url,
        init: {
          method,
          headers: this.buildHeaders(),
          ...(body ? { body: JSON.stringify(body) } : {}),
          signal: abortController.signal,
        },
        requestModel,
      });

      clearTimeout(timeoutId);
      return response;
    } catch (err) {
      clearTimeout(timeoutId);
      if (
        err instanceof DOMException &&
        err.name === "AbortError"
      ) {
        throw new ConnectionError("Request timeout", "timeout");
      }
      throw err;
    }
  }

  private buildHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.config.apiKey}`,
      ...(this.config.defaultHeaders ?? {}),
    };
  }

  private extractTraceId(response: Response): string {
    return response.headers.get("x-trace-id") ?? "";
  }
}

// ==============================================================
// Helpers
// ==============================================================

function mapPricing(
  raw: Record<string, unknown> | undefined,
): TokenPricing | CallPricing {
  if (!raw) {
    return { unit: "token", inputPer1M: 0, outputPer1M: 0, currency: "USD" };
  }

  if (raw.unit === "call") {
    return {
      unit: "call",
      perCall: (raw.per_call ?? raw.perCall ?? 0) as number,
      currency: "USD",
    };
  }

  return {
    unit: "token",
    inputPer1M: (raw.input_per_1m ?? raw.inputPer1M ?? 0) as number,
    outputPer1M: (raw.output_per_1m ?? raw.outputPer1M ?? 0) as number,
    currency: "USD",
  };
}
