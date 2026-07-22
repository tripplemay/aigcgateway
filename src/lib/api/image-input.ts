/**
 * BL-IMG-I2I-VISION F-IIV-02 — 图生图源图（`image` 参数）校验 + 日志占位符
 *
 * 供 REST /v1/images/generations、/v1/images/edits 与 MCP generate_image 共用。
 * 网关不 fetch 源图（D1，SSRF 留上游侧）；仅做形态 / 协议白名单 / base64 大小 /
 * 张数校验，限制复用 vision-limits（与 chat 图片输入同限：≤10 张、base64
 * 解码 ≤5MB、https/http/data:image）。
 */

import { VISION_LIMITS } from "./vision-limits";
import { validateImageUrl, placeholderForImageUrl } from "./chat-content";

export interface ImageInputError {
  /** errorResponse 的 code 字段（统一 invalid_parameter，与现有输入校验一致） */
  code: string;
  message: string;
  /** 出错字段定位，如 image[1] */
  param: string;
}

export type ImageInputResult = { ok: true; images: string[] } | { ok: false; error: ImageInputError };

const CODE = "invalid_parameter";

/**
 * 校验 `image` 参数并归一化为 string[]（string → [string]）。
 * 返回 ok:false 时带定位信息；调用方据此回 400 / MCP 错误。
 */
export function validateImageInput(image: unknown): ImageInputResult {
  const isSingle = typeof image === "string";
  const arr = isSingle ? [image as string] : image;

  if (!Array.isArray(arr)) {
    return {
      ok: false,
      error: {
        code: CODE,
        message: "image must be a string or an array of strings (http(s) URL or data:image base64 URI)",
        param: "image",
      },
    };
  }
  if (arr.length === 0) {
    return {
      ok: false,
      error: { code: CODE, message: "image must not be an empty array", param: "image" },
    };
  }
  if (arr.length > VISION_LIMITS.maxImagesPerRequest) {
    return {
      ok: false,
      error: {
        code: CODE,
        message: `image contains ${arr.length} images; maximum is ${VISION_LIMITS.maxImagesPerRequest}`,
        param: "image",
      },
    };
  }

  for (let i = 0; i < arr.length; i++) {
    const param = isSingle ? "image" : `image[${i}]`;
    const item = arr[i];
    if (typeof item !== "string" || item.length === 0) {
      return {
        ok: false,
        error: { code: CODE, message: `${param} must be a non-empty string`, param },
      };
    }
    const urlError = validateImageUrl(item, param);
    if (urlError) {
      return { ok: false, error: { code: urlError.code, message: urlError.message, param: urlError.param } };
    }
  }

  return { ok: true, images: arr as string[] };
}

/**
 * D6 日志卫生：源图列表 → 占位符列表（base64 → `[image:base64 NB]`、
 * URL → `[image:url host]`），防 call_logs 存原始字节。
 */
export function sanitizeImageInputForLog(images: string[]): string[] {
  return images.map(placeholderForImageUrl);
}
