/**
 * BL-IMAGE-LOG-DISPLAY-FIX F-ILDF-02 — isImageUrl helper 单测。
 *
 * 后端 F-ILDF-01 已 strip base64，前端 responseContent 只可能是 3 类：
 *   (1) http(s) image URL（含 gateway /v1/images/proxy/）
 *   (2) [image:fmt, NKB] metadata
 *   (3) 普通文本
 * 仅 (1) 走 <img>，(2)(3) 走文本。data: / ipfs: 等 protocol 显式不识别。
 */
import { describe, it, expect } from "vitest";
import { isImageUrl } from "../is-image-url";

describe("F-ILDF-02 isImageUrl", () => {
  it("https URL with image extension → true", () => {
    expect(isImageUrl("https://example.com/foo.png")).toBe(true);
    expect(isImageUrl("http://example.com/x.jpg")).toBe(true);
    expect(isImageUrl("https://example.com/img.webp")).toBe(true);
    expect(isImageUrl("https://example.com/x.gif")).toBe(true);
    expect(isImageUrl("https://example.com/x.svg")).toBe(true);
    expect(isImageUrl("https://example.com/x.jpeg")).toBe(true);
  });

  it("https URL with image extension + querystring → true", () => {
    expect(
      isImageUrl(
        "https://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com/seedream/abc.jpeg?X-Tos-Signature=xxx",
      ),
    ).toBe(true);
    // gateway proxy URL pattern
    expect(isImageUrl("https://aigc.guangai.ai/v1/images/proxy/trc_xxx/0?exp=1&sig=2")).toBe(true);
  });

  it("metadata string `[image:jpeg, 100KB]` → false (text path)", () => {
    expect(isImageUrl("[image:jpeg, 100KB]")).toBe(false);
    expect(isImageUrl("[image:png, 1024KB]")).toBe(false);
  });

  it("data: URL → false (X 方案 gateway 不再写 data:，前端见到也按文本)", () => {
    expect(isImageUrl("data:image/png;base64,xxx")).toBe(false);
    expect(isImageUrl("data:image/jpeg;base64,abc")).toBe(false);
  });

  it("plain text / chat completion content → false", () => {
    expect(isImageUrl("Hello, world!")).toBe(false);
    expect(isImageUrl("This is a long response from the model.")).toBe(false);
    expect(isImageUrl("")).toBe(false);
  });

  it("non-image http URL (no extension, no /v1/images/proxy/) → false", () => {
    expect(isImageUrl("https://example.com/api/foo")).toBe(false);
    expect(isImageUrl("https://example.com/")).toBe(false);
  });

  it("ipfs: / ftp: / file: → false (X 方案显式不识别)", () => {
    expect(isImageUrl("ipfs://Qm123/foo.png")).toBe(false);
    expect(isImageUrl("ftp://example.com/foo.png")).toBe(false);
    expect(isImageUrl("file:///local/path.png")).toBe(false);
  });

  it("trims whitespace before checking", () => {
    expect(isImageUrl("  https://example.com/foo.png  ")).toBe(true);
  });
});
