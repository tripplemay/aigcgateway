/**
 * OpenAI 兼容引擎（基座）
 *
 * 处理 80% 的服务商：OpenAI, Anthropic, DeepSeek, 智谱, OpenRouter
 * 火山引擎和硅基流动通过继承此类的专属 Adapter 覆盖差异逻辑。
 */

import type {
  EngineAdapter,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
  ImageGenerationRequest,
  ImageGenerationResponse,
  RouteResult,
  Usage,
} from "./types";
import { EngineError, ErrorCodes, sanitizeErrorMessage } from "./types";
import { applyConfigOverlay, getQuirks } from "./config-overlay";
import { createSSEParser, createTextDecoderStream } from "./sse-parser";

export class OpenAICompatEngine implements EngineAdapter {
  // ------------------------------------------------------------------
  // Model ID resolution — translates canonical model name to provider-
  // specific endpoint ID when a mapping exists in ProviderConfig.quirks.
  // This is the root fix for volcengine ep-ID being overwritten by sync.
  // ------------------------------------------------------------------

  protected resolveModelId(route: RouteResult): string {
    const quirks = route.config.quirks as Record<string, unknown> | null;
    const endpointMap = quirks?.endpointMap as Record<string, string> | undefined;
    return endpointMap?.[route.channel.realModelId] ?? route.channel.realModelId;
  }

  // ------------------------------------------------------------------
  // 公共方法
  // ------------------------------------------------------------------

  async chatCompletions(
    request: ChatCompletionRequest,
    route: RouteResult,
  ): Promise<ChatCompletionResponse> {
    const req = this.prepareRequest({ ...request, stream: false }, route);
    const url = this.buildUrl(route, "chat");
    const headers = this.buildHeaders(route);

    const response = await this.fetchWithProxy(
      url,
      {
        method: "POST",
        headers,
        body: JSON.stringify(req),
      },
      route,
    );

    const json = await response.json();
    const normalized = this.normalizeChatResponse(json);
    // F-DP-08: 当 json_object 模式时自动剥离 markdown code fence
    if (request.response_format?.type === "json_object") {
      for (const choice of normalized.choices) {
        if (typeof choice.message.content === "string") {
          choice.message.content = stripJsonCodeFence(choice.message.content);
        }
      }
    }
    return normalized;
  }

  async chatCompletionsStream(
    request: ChatCompletionRequest,
    route: RouteResult,
  ): Promise<ReadableStream<ChatCompletionChunk>> {
    const req = this.prepareRequest({ ...request, stream: true }, route);
    const url = this.buildUrl(route, "chat");
    const headers = this.buildHeaders(route);

    const response = await this.fetchWithProxy(
      url,
      {
        method: "POST",
        headers,
        body: JSON.stringify(req),
      },
      route,
    );

    if (!response.body) {
      throw new EngineError("No response body for stream", ErrorCodes.PROVIDER_ERROR, 502);
    }

    const sseParser = createSSEParser();
    const textDecoder = createTextDecoderStream();

    const chunkStream = new TransformStream<{ data: string; event?: string }, ChatCompletionChunk>({
      transform(sseEvent, controller) {
        try {
          const raw = JSON.parse(sseEvent.data) as Record<string, unknown>;
          // 标准化 usage 字段（提取 reasoning_tokens）
          if (raw.usage && typeof raw.usage === "object") {
            raw.usage = extractUsage(raw.usage as Record<string, unknown>);
          }
          controller.enqueue(raw as unknown as ChatCompletionChunk);
        } catch {
          // 跳过无法解析的 chunk（如服务商 debug 信息）
        }
      },
    });

    return response.body.pipeThrough(textDecoder).pipeThrough(sseParser).pipeThrough(chunkStream);
  }

  async imageGenerations(
    request: ImageGenerationRequest,
    route: RouteResult,
  ): Promise<ImageGenerationResponse> {
    const quirks = getQuirks(route.config);

    // OpenRouter 等使用 chat 接口生成图片
    if (quirks.has("image_via_chat_modalities")) {
      return this.imageViaChat(request, route);
    }

    const url = this.buildUrl(route, "image");
    const headers = this.buildHeaders(route);

    const body = {
      model: this.resolveModelId(route),
      prompt: request.prompt,
      n: request.n ?? 1,
      size: request.size ?? "1024x1024",
      ...(request.quality ? { quality: request.quality } : {}),
      ...(request.response_format ? { response_format: request.response_format } : {}),
    };

    const response = await this.fetchWithProxy(
      url,
      {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      },
      route,
    );

    const json = await response.json();
    return this.normalizeImageResponse(json);
  }

  // ------------------------------------------------------------------
  // 请求构建（protected，子类可覆盖）
  // ------------------------------------------------------------------

  protected prepareRequest(
    request: ChatCompletionRequest,
    route: RouteResult,
  ): ChatCompletionRequest {
    // 1. 替换为真实模型 ID（通过 resolveModelId 做 endpoint 映射）
    const req = { ...request, model: this.resolveModelId(route) };
    // 2. 应用配置覆盖
    const overlaid = applyConfigOverlay(req, route.config);
    // 3. 提取 max_reasoning_tokens（不让它原样透传到上游，避免 OpenAI 400）
    //    转为上游惯用字段：OpenAI 系列 → reasoning.max_tokens；
    //    DeepSeek R1 → thinking.budget_tokens；Anthropic → thinking.budget_tokens（由专属 adapter 处理）
    const { max_reasoning_tokens, ...rest } = overlaid as ChatCompletionRequest & {
      max_reasoning_tokens?: number;
      reasoning?: { max_tokens?: number };
    };
    if (max_reasoning_tokens !== undefined) {
      (rest as ChatCompletionRequest & { reasoning?: { max_tokens: number } }).reasoning = {
        max_tokens: max_reasoning_tokens,
      };
    }
    return rest as ChatCompletionRequest;
  }

  protected buildUrl(route: RouteResult, type: "chat" | "image"): string {
    let baseUrl = route.provider.baseUrl;
    const quirks = getQuirks(route.config);

    // 末尾斜杠处理
    if (quirks.has("base_url_trailing_slash")) {
      if (!baseUrl.endsWith("/")) baseUrl += "/";
    } else {
      baseUrl = baseUrl.replace(/\/+$/, "");
    }

    if (type === "chat") {
      const endpoint = route.config.chatEndpoint ?? "/chat/completions";
      return `${baseUrl}${endpoint}`;
    }

    const endpoint = route.config.imageEndpoint ?? "/images/generations";
    return `${baseUrl}${endpoint}`;
  }

  protected buildHeaders(route: RouteResult): Record<string, string> {
    const authConfig = route.provider.authConfig as { apiKey?: string };
    const apiKey = authConfig?.apiKey ?? "";

    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    };
  }

  // ------------------------------------------------------------------
  // 网络层（代理支持）
  // ------------------------------------------------------------------

  protected async fetchWithProxy(
    url: string,
    init: RequestInit,
    route: RouteResult,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60_000);

    // 代理支持：Provider.proxyUrl → undici ProxyAgent → fetch dispatcher
    const proxyUrl = route.provider.proxyUrl ?? process.env.PROXY_URL_PRIMARY ?? null;

    try {
      let response: Response;

      if (proxyUrl) {
        // 使用 undici 的 ProxyAgent 发送请求
        const { ProxyAgent, fetch: undiciFetch } = await import("undici");
        const dispatcher = new ProxyAgent(proxyUrl);
        response = await (undiciFetch as unknown as typeof fetch)(url, {
          ...init,
          signal: controller.signal,
          // @ts-expect-error undici dispatcher option
          dispatcher,
        });
      } else {
        response = await fetch(url, {
          ...init,
          signal: controller.signal,
        });
      }

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        throw this.mapProviderError(response.status, errorBody);
      }

      return response;
    } catch (error) {
      if (error instanceof EngineError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new EngineError("Request timeout", ErrorCodes.TIMEOUT, 504);
      }
      throw new EngineError(
        sanitizeErrorMessage(`Provider request failed: ${(error as Error).message}`),
        ErrorCodes.PROVIDER_ERROR,
        502,
        error,
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ------------------------------------------------------------------
  // 响应标准化（protected，子类可覆盖）
  // ------------------------------------------------------------------

  protected normalizeChatResponse(json: Record<string, unknown>): ChatCompletionResponse {
    const choices = (json.choices as Record<string, unknown>[]) ?? [];
    const usage = json.usage as Record<string, unknown> | undefined;

    return {
      id: (json.id as string) ?? "",
      object: "chat.completion",
      created: (json.created as number) ?? Math.floor(Date.now() / 1000),
      model: (json.model as string) ?? "",
      choices: choices.map((c, i) => {
        const msg = c.message as Record<string, unknown> | undefined;
        return {
          index: (c.index as number) ?? i,
          message: {
            role: "assistant" as const,
            // Fallback: some providers (zhipu, deepseek) put output in reasoning_content when content is empty
            content: (msg?.content as string) || (msg?.reasoning_content as string) || null,
            ...(msg?.tool_calls ? { tool_calls: msg.tool_calls as [] } : {}),
          },
          finish_reason: this.normalizeFinishReason(c.finish_reason as string | null),
        };
      }),
      usage: usage ? extractUsage(usage) : null,
    };
  }

  protected normalizeImageResponse(json: Record<string, unknown>): ImageGenerationResponse {
    const data = (json.data as Record<string, unknown>[]) ?? [];
    return {
      created: (json.created as number) ?? Math.floor(Date.now() / 1000),
      data: data.map((d) => ({
        ...(d.url ? { url: d.url as string } : {}),
        ...(d.b64_json ? { b64_json: d.b64_json as string } : {}),
        ...(d.revised_prompt ? { revised_prompt: d.revised_prompt as string } : {}),
      })),
    };
  }

  protected normalizeFinishReason(reason: string | null): string | null {
    if (!reason) return null;
    // DeepSeek 非标准值映射
    if (reason === "insufficient_system_resource") return "error";
    return reason;
  }

  // ------------------------------------------------------------------
  // 图片通过 chat 接口生成（OpenRouter 等）
  // ------------------------------------------------------------------

  protected async imageViaChat(
    request: ImageGenerationRequest,
    route: RouteResult,
  ): Promise<ImageGenerationResponse> {
    const chatReq: ChatCompletionRequest = {
      model: this.resolveModelId(route),
      messages: [{ role: "user", content: request.prompt }],
    };

    const result = await this.chatCompletions(chatReq, route);

    // 1. 检查 multimodal content（部分模型返回 content 数组含 image_url 类型）
    const choice = result.choices[0];
    const rawContent = choice?.message?.content;
    const msg = choice?.message as Record<string, unknown> | undefined;
    const parts = msg?.parts ?? (Array.isArray(msg?.content) ? msg.content : null);
    const diagBase = {
      model: route.channel.realModelId,
      provider: route.channel.providerId,
    };

    if (Array.isArray(parts)) {
      const partTypes = (parts as Array<Record<string, unknown>>).map(
        (p) => (p.type as string) ?? "unknown",
      );
      for (const part of parts) {
        const p = part as Record<string, unknown>;
        // OpenAI gpt-image 格式：{ type: "image_url", image_url: { url: "..." } }
        if (p.type === "image_url" && (p.image_url as Record<string, unknown>)?.url) {
          return {
            created: result.created,
            data: [{ url: (p.image_url as Record<string, unknown>).url as string }],
          };
        }
        // Gemini 原生格式：{ type: "inline_data", inline_data: { mime_type: "image/png", data: "base64..." } }
        const inlineData = p.inline_data as Record<string, unknown> | undefined;
        if ((p.type === "inline_data" || inlineData) && inlineData?.data) {
          const mime = (inlineData.mime_type as string) || "image/png";
          return {
            created: result.created,
            data: [{ url: `data:${mime};base64,${inlineData.data as string}` }],
          };
        }
      }
      // Stage 1 失败：multimodal parts 存在但无 image_url / inline_data
      console.error("[imageViaChat] extraction failed", {
        stage: "multimodal-parts",
        contentType: typeof rawContent,
        partTypes,
        urlCandidateCount: 0,
        dataUriFound: false,
        ...diagBase,
      });
    }

    const content = typeof rawContent === "string" ? rawContent : "";

    // 2. 检查 base64 data URI（部分模型内联返回图片）
    const base64Match = content.match(/data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+/);
    if (base64Match) {
      return {
        created: result.created,
        data: [{ url: base64Match[0] }],
      };
    }

    if (content.length > 0) {
      const dataUriFound = /data:image\//.test(content);
      const urlCandidateCount = (content.match(/https?:\/\//g) ?? []).length;

      // Stage 2 失败：无 base64 data URI
      console.error("[imageViaChat] extraction failed", {
        stage: "base64",
        contentType: typeof rawContent,
        partTypes: [],
        urlCandidateCount,
        dataUriFound,
        ...diagBase,
      });
    }

    // 3. 匹配带扩展名的图片 URL
    const urlWithExtMatch = content.match(/https?:\/\/[^\s"'<>]+\.(png|jpg|jpeg|webp|gif)/i);
    if (urlWithExtMatch) {
      return {
        created: result.created,
        data: [{ url: urlWithExtMatch[0] }],
      };
    }

    // Stage 3 失败：无带扩展名的图片 URL
    if (content.length > 0) {
      console.error("[imageViaChat] extraction failed", {
        stage: "url-with-ext",
        contentType: typeof rawContent,
        partTypes: [],
        urlCandidateCount: (content.match(/https?:\/\//g) ?? []).length,
        dataUriFound: /data:image\//.test(content),
        ...diagBase,
      });
    }

    // 4. 匹配任意 HTTPS URL（兼容 Google Storage 等无扩展名链接）
    const anyUrlMatch = content.match(/https?:\/\/[^\s"'<>]+/);
    if (anyUrlMatch) {
      return {
        created: result.created,
        data: [{ url: anyUrlMatch[0] }],
      };
    }

    // Stage 4: 四级全部失败
    const urlCandidateCountFinal = (content.match(/https?:\/\//g) ?? []).length;
    console.error("[imageViaChat] extraction failed", {
      stage: "any-https",
      contentType: typeof rawContent,
      partTypes: [],
      urlCandidateCount: urlCandidateCountFinal,
      dataUriFound: /data:image\//.test(content),
      ...diagBase,
    });

    throw this.mapProviderError(
      200,
      JSON.stringify({
        error: {
          message: `Image generation via chat returned no extractable image. The model responded with text instead of an image. Content preview: "${content.slice(0, 100)}"`,
          code: "no_image_in_response",
        },
      }),
    );
  }

  // ------------------------------------------------------------------
  // 错误映射
  // ------------------------------------------------------------------

  protected mapProviderError(status: number, body: string): EngineError {
    let message = `Provider returned ${status}`;
    let code: string = ErrorCodes.PROVIDER_ERROR;
    let parsed: Record<string, unknown> | undefined;

    try {
      parsed = JSON.parse(body);
      const err = parsed?.error as Record<string, unknown> | undefined;
      if (err?.message) message = err.message as string;
    } catch {
      if (body) message = body.slice(0, 500);
    }

    switch (status) {
      case 400:
        code = ErrorCodes.INVALID_REQUEST;
        break;
      case 401:
      case 403:
        code = ErrorCodes.AUTH_FAILED;
        break;
      case 404:
        code = ErrorCodes.MODEL_NOT_FOUND;
        break;
      case 429:
        code = ErrorCodes.RATE_LIMITED;
        break;
    }

    return new EngineError(sanitizeErrorMessage(message), code, status, parsed);
  }

  // ------------------------------------------------------------------
  // 工具方法：从流式响应提取最终 usage
  // ------------------------------------------------------------------

  static extractUsageFromStream(chunks: ChatCompletionChunk[]): Usage | null {
    // 最后一个 chunk 通常包含 usage（如果 stream_options.include_usage = true）
    for (let i = chunks.length - 1; i >= 0; i--) {
      if (chunks[i].usage) return chunks[i].usage!;
    }
    return null;
  }
}

/**
 * 从上游 usage 中提取标准化 Usage，包含 reasoning_tokens（若有）。
 *
 * 支持的上游字段位置：
 * - OpenAI o1/o3: usage.completion_tokens_details.reasoning_tokens
 * - DeepSeek R1 / Zhipu GLM Thinking: usage.reasoning_tokens（扁平）
 * - Anthropic extended thinking: usage.thinking_tokens（通过 adapter 转换后亦可落到 reasoning_tokens）
 */
export function extractUsage(raw: Record<string, unknown>): Usage {
  const promptTokens = toNumber(raw.prompt_tokens) ?? 0;
  const completionTokens = toNumber(raw.completion_tokens) ?? 0;
  const totalTokens = toNumber(raw.total_tokens) ?? promptTokens + completionTokens;

  const details = raw.completion_tokens_details as Record<string, unknown> | undefined;
  const reasoningTokens =
    toNumber(details?.reasoning_tokens) ??
    toNumber(raw.reasoning_tokens) ??
    toNumber(raw.thinking_tokens);

  const usage: Usage = {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
  };
  if (reasoningTokens !== undefined && reasoningTokens > 0) {
    usage.reasoning_tokens = reasoningTokens;
  }
  return usage;
}

/**
 * 剥离 markdown 代码围栏，返回裸 JSON 字符串。
 *
 * 支持格式：
 *   ```json\n{...}\n```
 *   ```\n{...}\n```
 *   前后空白自动 trim
 * 无围栏时原样返回（不影响已经是裸 JSON 的响应）
 */
export function stripJsonCodeFence(content: string): string {
  const trimmed = content.trim();
  // 匹配 ```json 或 ``` 开头 + 可选换行 + 内容 + 可选换行 + ``` 结尾
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }
  return trimmed;
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}
