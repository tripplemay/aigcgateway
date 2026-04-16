/**
 * 火山引擎方舟 — 专属 Adapter
 *
 * 差异：
 * 1. 图片生成优先走 chat 接口 → 回退 /images/generations
 * 2. 多尺寸重试（默认 → 1024x1024 → 2048x2048）
 * 3. 图片失败不计费（通过 noChargeOnFailure 标记）
 * 4. model 参数可以是 Endpoint ID
 */

import { OpenAICompatEngine } from "../openai-compat";
import type { ImageGenerationRequest, ImageGenerationResponse, RouteResult } from "../types";
import { EngineError, ErrorCodes } from "../types";

export class VolcengineAdapter extends OpenAICompatEngine {
  /**
   * 图片生成：chat 优先 → 回退 images → 多尺寸重试
   */
  async imageGenerations(
    request: ImageGenerationRequest,
    route: RouteResult,
  ): Promise<ImageGenerationResponse> {
    const sizes = this.buildSizeList(request.size);

    for (let i = 0; i < sizes.length; i++) {
      const isLast = i === sizes.length - 1;
      const currentReq = { ...request, size: sizes[i] };

      try {
        // 优先尝试 chat 接口
        return await this.imageViaChat(currentReq, route);
      } catch (chatError) {
        // chat 失败，尝试 /images/generations
        try {
          return await this.imageFallback(currentReq, route);
        } catch (fallbackError) {
          // 最后一个尺寸也失败了
          if (isLast) {
            throw this.wrapImageError(fallbackError);
          }
          // 继续尝试下一个尺寸
        }
      }
    }

    // 不应到达这里
    throw new EngineError("All image generation attempts failed", ErrorCodes.PROVIDER_ERROR, 502);
  }

  /**
   * 通过 chat 接口生成图片
   */
  protected override async imageViaChat(
    request: ImageGenerationRequest,
    route: RouteResult,
  ): Promise<ImageGenerationResponse> {
    const url = this.buildUrl(route, "chat");
    const headers = this.buildHeaders(route);

    const body = {
      model: this.resolveModelId(route),
      messages: [{ role: "user", content: request.prompt }],
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

    const json = (await response.json()) as Record<string, unknown>;
    return this.extractImageFromChatResponse(json);
  }

  /**
   * 回退到 /images/generations
   */
  private async imageFallback(
    request: ImageGenerationRequest,
    route: RouteResult,
  ): Promise<ImageGenerationResponse> {
    const url = this.buildUrl(route, "image");
    const headers = this.buildHeaders(route);

    const body = {
      model: this.resolveModelId(route),
      prompt: request.prompt,
      n: request.n ?? 1,
      ...(request.size ? { size: request.size } : {}),
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

    const json = (await response.json()) as Record<string, unknown>;
    return this.normalizeImageResponse(json);
  }

  /**
   * 从 chat 响应提取图片
   */
  private extractImageFromChatResponse(json: Record<string, unknown>): ImageGenerationResponse {
    const choices = (json.choices as Record<string, unknown>[]) ?? [];
    const msg = choices[0]?.message as Record<string, unknown> | undefined;
    const content = (msg?.content as string) ?? "";

    // 尝试提取 URL
    const urlMatch = content.match(/https?:\/\/[^\s"'<>]+\.(png|jpg|jpeg|webp|gif|bmp)/i);

    if (urlMatch) {
      return {
        created: Math.floor(Date.now() / 1000),
        data: [{ url: urlMatch[0] }],
      };
    }

    // 如果 content 本身是 URL
    if (content.startsWith("http")) {
      return {
        created: Math.floor(Date.now() / 1000),
        data: [{ url: content.trim() }],
      };
    }

    throw new EngineError(
      "Failed to extract image from chat response",
      ErrorCodes.PROVIDER_ERROR,
      502,
    );
  }

  /**
   * 构建尺寸重试列表
   */
  private buildSizeList(requestedSize?: string): (string | undefined)[] {
    const sizes: (string | undefined)[] = [requestedSize];
    const fallbacks = ["1024x1024", "2048x2048"];
    for (const fb of fallbacks) {
      if (fb !== requestedSize) sizes.push(fb);
    }
    return sizes;
  }

  private wrapImageError(error: unknown): EngineError {
    if (error instanceof EngineError) return error;
    return new EngineError(
      `Volcengine image generation failed: ${(error as Error).message}`,
      ErrorCodes.PROVIDER_ERROR,
      502,
      error,
    );
  }
}
