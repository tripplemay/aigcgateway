/**
 * BL-BILLING-AUDIT-EXT-P1 fix-round-1 Bug 1 — fetcher key → DB provider.name 映射。
 *
 * chatanywhere provider 在 DB 中历史遗留命名为 'openai'（兼容原生 OpenAI
 * 入口）。script 的 FETCHERS key 保持语义命名 'chatanywhere'，通过
 * resolveProviderName 映射到真实 DB row。
 */
import { describe, it, expect } from "vitest";
import { resolveProviderName } from "../test-billing-fetchers";

describe("fix-round-1 Bug 1 resolveProviderName", () => {
  it("maps 'chatanywhere' → DB provider.name 'openai'", () => {
    expect(resolveProviderName("chatanywhere")).toBe("openai");
  });

  it("passes through 'volcengine' unchanged", () => {
    expect(resolveProviderName("volcengine")).toBe("volcengine");
  });

  it("passes through 'openrouter' unchanged", () => {
    expect(resolveProviderName("openrouter")).toBe("openrouter");
  });

  it("passes through unknown names unchanged (no accidental rewrite)", () => {
    expect(resolveProviderName("deepseek")).toBe("deepseek");
  });
});
