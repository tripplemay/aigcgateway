/**
 * BL-IMAGE-LOG-DISPLAY-FIX F-ILDF-02 — image URL 识别 helper。
 *
 * 后端 F-ILDF-01 把 base64 strip 成 metadata 字符串，落库的 responseContent
 * 只有 3 种形态：(1) http(s) image URL（含 gateway /v1/images/proxy/ 签名 URL）
 * (2) [image:fmt, NKB] metadata (3) 普通文本。
 * 仅 (1) 渲染 <img>。data: / ipfs: / 其他 protocol 全部走文本（X 方案安全
 * 边界 — gateway 不再写 data:，前端见到也按文本处理）。
 *
 * 抽到独立 .ts 文件让 vitest 可以无需 JSX 解析直接 import 测试。
 */
export function isImageUrl(text: string): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (!/^https?:\/\//i.test(trimmed)) return false;
  // 显式 image extension（query string 后缀也兼容）
  if (/\.(jpg|jpeg|png|gif|webp|svg)(\?|#|$)/i.test(trimmed)) return true;
  // gateway 签名 image-proxy 路径（无扩展名也算 image）
  if (/\/v1\/images\/proxy\//i.test(trimmed)) return true;
  return false;
}
