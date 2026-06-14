/**
 * BL-VISION-INPUT — 图片输入（vision/多模态）安全限制常量
 *
 * 集中定义，便于后续接 systemConfig 调参。默认值（spec D4）：
 * - 单请求 image part 数 ≤ 10
 * - 单张 base64 解码后 ≤ 5 MB（http URL 不限大小，由上游约束）
 * - image_url.url 协议白名单：https / http / data:image/<type>;base64,
 */

export const VISION_LIMITS = {
  /** 单个请求允许的 image_url part 总数上限 */
  maxImagesPerRequest: 10,
  /** 单张 base64 内联图片解码后的字节上限（5 MB） */
  maxBase64DecodedBytes: 5 * 1024 * 1024,
  /** http(s) URL 允许的协议（URL.protocol 形式，含冒号） */
  allowedUrlSchemes: ["https:", "http:"] as readonly string[],
} as const;

/** 合法 base64 图片 data URI 前缀，如 `data:image/png;base64,` */
export const DATA_URI_IMAGE_RE = /^data:image\/[a-zA-Z0-9.+-]+;base64,/;
