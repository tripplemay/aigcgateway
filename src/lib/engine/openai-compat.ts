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
import { EngineError, ErrorCodes } from "./types";
import { applyConfigOverlay, getQuirks } from "./config-overlay";
import { createSSEParser, createTextDecoderStream } from "./sse-parser";

export class OpenAICompatEngine implements EngineAdapter {
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
    return this.normalizeChatResponse(json);
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
          const chunk = JSON.parse(sseEvent.data) as ChatCompletionChunk;
          controller.enqueue(chunk);
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
      model: route.channel.realModelId,
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
    // 1. 替换为真实模型 ID
    const req = { ...request, model: route.channel.realModelId };
    // 2. 应用配置覆盖
    return applyConfigOverlay(req, route.config);
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
        `Provider request failed: ${(error as Error).message}`,
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
    const usage = json.usage as Record<string, number> | undefined;

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
      usage: usage
        ? {
            prompt_tokens: usage.prompt_tokens ?? 0,
            completion_tokens: usage.completion_tokens ?? 0,
            total_tokens: usage.total_tokens ?? 0,
          }
        : null,
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
      model: route.channel.realModelId,
      messages: [{ role: "user", content: request.prompt }],
    };

    const result = await this.chatCompletions(chatReq, route);
    const content = result.choices[0]?.message?.content ?? "";

    // 尝试从 content 中提取图片 URL
    // 优先匹配带扩展名的图片 URL，其次匹配任意 HTTPS URL（兼容 Google Storage 等无扩展名链接）
    const urlWithExtMatch = content.match(/https?:\/\/[^\s"'<>]+\.(png|jpg|jpeg|webp|gif)/i);
    if (urlWithExtMatch) {
      return {
        created: result.created,
        data: [{ url: urlWithExtMatch[0] }],
      };
    }

    const anyUrlMatch = content.match(/https?:\/\/[^\s"'<>]+/);
    if (anyUrlMatch) {
      return {
        created: result.created,
        data: [{ url: anyUrlMatch[0] }],
      };
    }

    // content 为空或不含 URL，返回空数组（上层 filter(Boolean) 会正确处理）
    return {
      created: result.created,
      data: content ? [{ url: content }] : [],
    };
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

    return new EngineError(message, code, status, parsed);
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
