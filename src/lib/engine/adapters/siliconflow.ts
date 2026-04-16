/**
 * 硅基流动 — 专属 Adapter
 *
 * 差异：
 * 1. 图片响应格式：images[0].url → 标准 data[0].url
 * 2. 其余与 OpenAI 兼容
 */

import { OpenAICompatEngine } from "../openai-compat";
import type { ImageGenerationRequest, ImageGenerationResponse, RouteResult } from "../types";

export class SiliconFlowAdapter extends OpenAICompatEngine {
  /**
   * 图片生成：标准 /images/generations 端点，但响应格式不同
   */
  async imageGenerations(
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

    // 转换 images[0].url → data[0].url
    return this.normalizeSiliconFlowImageResponse(json);
  }

  private normalizeSiliconFlowImageResponse(
    json: Record<string, unknown>,
  ): ImageGenerationResponse {
    // 硅基流动返回 { images: [{ url: "..." }] } 而非标准 { data: [{ url: "..." }] }
    const images = (json.images as Array<{ url: string }>) ?? [];
    const data = (json.data as Array<{ url?: string; b64_json?: string }>) ?? [];

    // 如果有 images 字段，做转换；否则尝试标准 data 字段
    if (images.length > 0) {
      return {
        created: Math.floor(Date.now() / 1000),
        data: images.map((img) => ({ url: img.url })),
      };
    }

    // 回退到标准格式
    return {
      created: (json.created as number) ?? Math.floor(Date.now() / 1000),
      data: data.map((d) => ({
        ...(d.url ? { url: d.url } : {}),
        ...(d.b64_json ? { b64_json: d.b64_json } : {}),
      })),
    };
  }
}
