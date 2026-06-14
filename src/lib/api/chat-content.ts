/**
 * BL-VISION-INPUT F-VI-01 — chat messages 的 content 多模态校验
 *
 * 支持 OpenAI 多模态格式：content 可为
 *   - 非空 string（向后兼容）
 *   - ChatContentPart[]：{type:"text",text} | {type:"image_url",image_url:{url,detail?}}
 *
 * 网关不 fetch image_url（由上游拉取，SSRF 在上游侧）；仅做格式 / 协议白名单 /
 * base64 大小 / 图片数量校验。可复用：REST route 当前消费，未来 MCP 面亦可共用。
 */

import { VISION_LIMITS, DATA_URI_IMAGE_RE } from "./vision-limits";

export interface ContentValidationError {
  /** errorResponse 的 code 字段（统一 invalid_parameter，与现有输入校验一致） */
  code: string;
  /** 面向调用方的错误信息 */
  message: string;
  /** 出错字段定位，如 messages[0].content[1].image_url.url */
  param: string;
}

interface RawMessage {
  role?: string;
  content?: unknown;
}

const CODE = "invalid_parameter";

/**
 * 校验所有 message 的 content。返回首个错误；全部合法返回 null。
 */
export function validateMessagesContent(messages: RawMessage[]): ContentValidationError | null {
  let totalImageParts = 0;

  for (let i = 0; i < messages.length; i++) {
    const content = messages[i]?.content;
    const param = `messages[${i}].content`;

    // string 路径（向后兼容：保留 F-WP-05 的非空约束）
    if (typeof content === "string") {
      if (content.length === 0) {
        return { code: CODE, message: `${param} must be a non-empty string`, param };
      }
      continue;
    }

    // 数组路径（多模态）
    if (!Array.isArray(content)) {
      return {
        code: CODE,
        message: `${param} must be a non-empty string or an array of content parts`,
        param,
      };
    }
    if (content.length === 0) {
      return { code: CODE, message: `${param} must not be an empty array`, param };
    }

    for (let j = 0; j < content.length; j++) {
      const partParam = `${param}[${j}]`;
      const part = content[j];
      if (typeof part !== "object" || part === null) {
        return { code: CODE, message: `${partParam} must be an object`, param: partParam };
      }
      const p = part as { type?: unknown; text?: unknown; image_url?: unknown };

      if (p.type === "text") {
        if (typeof p.text !== "string" || p.text.length === 0) {
          return {
            code: CODE,
            message: `${partParam}.text must be a non-empty string`,
            param: `${partParam}.text`,
          };
        }
        continue;
      }

      if (p.type === "image_url") {
        const imageUrl = p.image_url as { url?: unknown } | undefined;
        const url = imageUrl?.url;
        if (typeof url !== "string" || url.length === 0) {
          return {
            code: CODE,
            message: `${partParam}.image_url.url must be a non-empty string`,
            param: `${partParam}.image_url.url`,
          };
        }
        const urlError = validateImageUrl(url, `${partParam}.image_url.url`);
        if (urlError) return urlError;
        totalImageParts++;
        continue;
      }

      return {
        code: CODE,
        message: `${partParam}.type must be "text" or "image_url"`,
        param: `${partParam}.type`,
      };
    }
  }

  if (totalImageParts > VISION_LIMITS.maxImagesPerRequest) {
    return {
      code: CODE,
      message: `request contains ${totalImageParts} images; maximum is ${VISION_LIMITS.maxImagesPerRequest}`,
      param: "messages",
    };
  }

  return null;
}

/**
 * 校验单个 image_url：data:image base64（含大小上限）或 http(s) URL（协议白名单）。
 */
function validateImageUrl(url: string, param: string): ContentValidationError | null {
  if (url.startsWith("data:")) {
    const match = DATA_URI_IMAGE_RE.exec(url);
    if (!match) {
      return {
        code: CODE,
        message: `${param} must be a data:image/<type>;base64,... URI or an http(s) URL`,
        param,
      };
    }
    const decodedBytes = base64DecodedSize(url.slice(match[0].length));
    if (decodedBytes > VISION_LIMITS.maxBase64DecodedBytes) {
      const maxMb = Math.round(VISION_LIMITS.maxBase64DecodedBytes / (1024 * 1024));
      return {
        code: CODE,
        message: `${param} base64 image (${Math.round(decodedBytes / 1024)}KB) exceeds the ${maxMb}MB limit`,
        param,
      };
    }
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { code: CODE, message: `${param} is not a valid URL`, param };
  }
  if (!VISION_LIMITS.allowedUrlSchemes.includes(parsed.protocol)) {
    return {
      code: CODE,
      message: `${param} scheme "${parsed.protocol}" is not allowed; use https, http, or data:image`,
      param,
    };
  }
  return null;
}

/**
 * 估算 base64 字符串解码后的字节数（不分配解码 buffer）。
 */
function base64DecodedSize(b64: string): number {
  const len = b64.length;
  if (len === 0) return 0;
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((len * 3) / 4) - padding;
}

/**
 * 请求中是否含至少一个 image_url part（供 vision 能力门禁 F-VI-02 复用）。
 */
export function messagesContainImage(messages: RawMessage[]): boolean {
  return messages.some((m) => {
    const c = m?.content;
    return Array.isArray(c) && c.some(isImagePart);
  });
}

function isImagePart(part: unknown): boolean {
  return (
    typeof part === "object" && part !== null && (part as { type?: unknown }).type === "image_url"
  );
}

/**
 * BL-VISION-INPUT F-VI-03 — 日志卫生：把 content 里图片的 url 替换为占位符，
 * 避免 base64 原始字节 / 完整 URL 写入 call_logs（DB 暴涨）。text part 原样保留，
 * string content 原样返回。返回新结构（不改原 messages）。
 */
export function sanitizeMessagesForLog(messages: RawMessage[]): RawMessage[] {
  return messages.map((m) => {
    const c = m?.content;
    if (!Array.isArray(c)) return m;
    return { ...m, content: c.map(sanitizePart) };
  });
}

function sanitizePart(part: unknown): unknown {
  if (typeof part !== "object" || part === null) return part;
  const p = part as { type?: unknown; image_url?: { url?: unknown } };
  if (p.type !== "image_url") return part;
  return { ...p, image_url: { ...p.image_url, url: placeholderForImageUrl(p.image_url?.url) } };
}

function placeholderForImageUrl(url: unknown): string {
  if (typeof url !== "string") return "[image]";
  if (url.startsWith("data:")) {
    const commaIdx = url.indexOf(",");
    const b64 = commaIdx >= 0 ? url.slice(commaIdx + 1) : "";
    return `[image:base64 ${base64DecodedSize(b64)}B]`;
  }
  try {
    return `[image:url ${new URL(url).host}]`;
  } catch {
    return "[image:url]";
  }
}
