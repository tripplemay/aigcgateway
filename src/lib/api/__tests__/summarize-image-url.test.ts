/**
 * BL-IMAGE-LOG-DISPLAY-FIX F-ILDF-01 — summarizeImageUrl helper 单测。
 *
 * 把 base64 data URL 转 metadata 字符串落库，http(s) URL 透传。RFC 2397
 * 标准 data: 头解析；非标准格式 fallback 不抛错。
 *
 * 容差：±1KB（spec § 3.1 #2，铁律 1.3）。
 */
import { describe, it, expect } from "vitest";
import { summarizeImageUrl } from "../post-process";

describe("F-ILDF-01 summarizeImageUrl", () => {
  it("http(s) URL pass-through unchanged", () => {
    expect(summarizeImageUrl("https://example.com/foo.png")).toBe(
      "https://example.com/foo.png",
    );
    expect(summarizeImageUrl("http://example.com/x.jpg?exp=123")).toBe(
      "http://example.com/x.jpg?exp=123",
    );
    // gateway image-proxy URL：保留以便前端 <img> 渲染
    expect(
      summarizeImageUrl(
        "https://aigc.guangai.ai/v1/images/proxy/trc_xxx/0?exp=1&sig=2",
      ),
    ).toBe("https://aigc.guangai.ai/v1/images/proxy/trc_xxx/0?exp=1&sig=2");
  });

  it("data:image/jpeg;base64 of ~100KB → [image:jpeg, 100KB] (±1KB tolerance)", () => {
    const fakeBase64 = "x".repeat(100 * 1024 - 30); // 留出 prefix 占位
    const url = `data:image/jpeg;base64,${fakeBase64}`;
    const out = summarizeImageUrl(url);
    expect(out).toMatch(/^\[image:jpeg, \d+KB\]$/);
    const sizeMatch = out!.match(/(\d+)KB/);
    expect(sizeMatch).not.toBeNull();
    const sizeKB = parseInt(sizeMatch![1], 10);
    // raw url length / 1024 ≈ 100；tolerance ±1KB（铁律 1.3）
    expect(sizeKB).toBeGreaterThanOrEqual(99);
    expect(sizeKB).toBeLessThanOrEqual(101);
  });

  it("data:image/png;base64 of ~1MB → [image:png, ~1024KB]", () => {
    const fakeBase64 = "y".repeat(1024 * 1024 - 30);
    const url = `data:image/png;base64,${fakeBase64}`;
    const out = summarizeImageUrl(url);
    expect(out).toMatch(/^\[image:png, \d+KB\]$/);
    const sizeKB = parseInt(out!.match(/(\d+)KB/)![1], 10);
    expect(sizeKB).toBeGreaterThanOrEqual(1023);
    expect(sizeKB).toBeLessThanOrEqual(1025);
  });

  it("data: prefix without standard ;base64, → fallback unknown format, no throw", () => {
    // 非标准 data: 格式（缺 ;base64,）
    const url = "data:weird-but-not-base64";
    const out = summarizeImageUrl(url);
    expect(out).toMatch(/^\[image:unknown, \d+KB\]$/);
  });

  it("null / undefined / empty → null pass-through", () => {
    expect(summarizeImageUrl(null)).toBeNull();
    expect(summarizeImageUrl(undefined)).toBeNull();
    expect(summarizeImageUrl("")).toBeNull();
  });

  it("idempotent: a metadata string `[image:jpeg, 100KB]` doesn't start with data:, so passes through", () => {
    // strip-image-base64 backfill 重跑要幂等：metadata 字符串再过 helper 不变
    const meta = "[image:jpeg, 100KB]";
    expect(summarizeImageUrl(meta)).toBe(meta);
  });

  it("data:image/webp+xml;charset=utf-8;base64 (multi-param mime) → format=webp+xml", () => {
    // RFC 2397 允许 mime 后多 ;param=value，正则只取第一个 ;
    const url = `data:image/webp+xml;charset=utf-8;base64,abc`;
    const out = summarizeImageUrl(url);
    expect(out).toMatch(/^\[image:webp\+xml, \d+KB\]$/);
  });
});
