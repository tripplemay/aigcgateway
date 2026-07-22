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
   *
   * F-IIV-04: request.image（源图）存在时 content 升级为多模态数组，防止 chat
   * 路径静默丢弃源图（i2i 退化为 t2i）。实测（2026-07-22，见
   * BL-IMG-I2I-VISION-ops.md）seedream-4-5 的 chat API 整体不可用
   * （"does not support this api"），恒回退 imageFallback——此改动对该模型
   * 行为无影响，仅保证未来支持 chat 的图模不丢源图。
   */
  protected override async imageViaChat(
    request: ImageGenerationRequest,
    route: RouteResult,
  ): Promise<ImageGenerationResponse> {
    const url = this.buildUrl(route, "chat");
    const headers = this.buildHeaders(route);

    const sourceImages = request.image
      ? Array.isArray(request.image)
        ? request.image
        : [request.image]
      : [];
    const content =
      sourceImages.length > 0
        ? [
            { type: "text", text: request.prompt },
            ...sourceImages.map((img) => ({ type: "image_url", image_url: { url: img } })),
          ]
        : request.prompt;

    const body = {
      model: this.resolveModelId(route),
      messages: [{ role: "user", content }],
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
    this.throwIfBodyError(json);
    return this.extractImageFromChatResponse(json);
  }

  /**
   * 回退到 /images/generations
   *
   * F-IIV-04 (D5): 源图上送——实测（2026-07-22，ep-20260604162024-k2sbk，见
   * BL-IMG-I2I-VISION-ops.md）`image` 字段三种形态全通：单 URL string /
   * string[]（多图融合）/ base64 data URI。seedream-4-5 的 i2i 即走此路径
   * （其 chat API 不可用，imageViaChat 恒失败后回退至此）。
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
      // 源图透传：上游接受 string | string[]，route 层已归一化为 string[]
      ...(request.image ? { image: request.image } : {}),
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
    this.throwIfBodyError(json);
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
