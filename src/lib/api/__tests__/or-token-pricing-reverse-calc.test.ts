/**
 * BL-IMAGE-PRICING-OR-P2 F-BIPOR-03 — OR token-priced channel cost 反算单测。
 *
 * 验证 calculateTokenCost 对 token-计价 OR image channel 的输出符合公式：
 *   costUsd = (prompt_tokens × inputPer1M + completion_tokens × outputPer1M) / 1e6
 *
 * 这是 processChatResult 链路上的核心公式：fetch → adapter → response.usage →
 * calculateTokenCost → call_log.costPrice。本测从 calculateTokenCost 边界直接
 * 校验公式，配合 P1 attempt_chain 测试覆盖了完整链路。
 *
 * 反例：token 全 0 → cost=0 + WARN（写日志而非抛错）。
 */
import { describe, it, expect, vi } from "vitest";
import { calculateTokenCost } from "../post-process";
import type { RouteResult, Usage } from "../../engine/types";

function makeOrRoute(input: number, output: number): RouteResult {
  return {
    channel: {
      id: "ch_or_test",
      costPrice: { unit: "token", inputPer1M: input, outputPer1M: output },
      sellPrice: { unit: "token", inputPer1M: input * 1.2, outputPer1M: output * 1.2 },
    },
    alias: { alias: "or-test", sellPrice: null },
    config: { currency: "USD" },
    model: { capabilities: null },
  } as unknown as RouteResult;
}

const usage1k500: Usage = {
  prompt_tokens: 1000,
  completion_tokens: 500,
  total_tokens: 1500,
};

describe("F-BIPOR-03 OR token cost reverse-calc", () => {
  it("google/gemini-2.5-flash-image (0.30/2.50) → cost = 0.00155 USD", () => {
    const { costUsd, sellUsd } = calculateTokenCost(usage1k500, makeOrRoute(0.3, 2.5), "SUCCESS");
    // 1000 × 0.3 / 1e6 + 500 × 2.5 / 1e6 = 0.0003 + 0.00125 = 0.00155
    expect(costUsd).toBeCloseTo(0.00155, 8);
    // sellPrice = costPrice × 1.2 → 0.00186
    expect(sellUsd).toBeCloseTo(0.00186, 8);
  });

  it("openai/gpt-5-image (10/10) → cost = 0.015 USD", () => {
    const { costUsd } = calculateTokenCost(usage1k500, makeOrRoute(10, 10), "SUCCESS");
    // 1000 × 10 / 1e6 + 500 × 10 / 1e6 = 0.01 + 0.005 = 0.015
    expect(costUsd).toBeCloseTo(0.015, 8);
  });

  it("google/gemini-3-pro-image-preview (2/12) → cost = 0.008 USD", () => {
    const { costUsd } = calculateTokenCost(usage1k500, makeOrRoute(2, 12), "SUCCESS");
    // 1000 × 2 / 1e6 + 500 × 12 / 1e6 = 0.002 + 0.006 = 0.008
    expect(costUsd).toBeCloseTo(0.008, 8);
  });

  it("openai/gpt-5.4-image-2 (8/15) → cost = 0.0155 USD", () => {
    const { costUsd } = calculateTokenCost(usage1k500, makeOrRoute(8, 15), "SUCCESS");
    // 1000 × 8 / 1e6 + 500 × 15 / 1e6 = 0.008 + 0.0075 = 0.0155
    expect(costUsd).toBeCloseTo(0.0155, 8);
  });

  it("input-only usage: 5000 prompt × 0.30 / 1e6 = 0.0015", () => {
    const usageOnlyPrompt: Usage = { prompt_tokens: 5000, completion_tokens: 0, total_tokens: 5000 };
    const { costUsd } = calculateTokenCost(usageOnlyPrompt, makeOrRoute(0.3, 2.5), "SUCCESS");
    expect(costUsd).toBeCloseTo(0.0015, 8);
  });

  it("FILTERED status → only input counted (P1 contract preserved for token unit)", () => {
    const { costUsd } = calculateTokenCost(usage1k500, makeOrRoute(10, 10), "FILTERED");
    // FILTERED → completion_tokens forced to 0
    // 1000 × 10 / 1e6 + 0 × 10 / 1e6 = 0.01
    expect(costUsd).toBeCloseTo(0.01, 8);
  });

  it("ERROR status → cost=0 (no charge for failed calls)", () => {
    const { costUsd } = calculateTokenCost(usage1k500, makeOrRoute(10, 10), "ERROR");
    expect(costUsd).toBe(0);
  });
});

describe("F-BIPOR-03 token-zero pricing fallback", () => {
  it("costPrice token all-zero → cost=0 (no NaN, no throw)", () => {
    const { costUsd, sellUsd } = calculateTokenCost(usage1k500, makeOrRoute(0, 0), "SUCCESS");
    expect(costUsd).toBe(0);
    expect(sellUsd).toBe(0);
  });

  it("costPrice null → cost=0 (handled by P1 null-guard)", () => {
    const route = {
      channel: { id: "ch_x", costPrice: null, sellPrice: null },
      alias: null,
      config: { currency: "USD" },
      model: { capabilities: null },
    } as unknown as RouteResult;
    const { costUsd, sellUsd } = calculateTokenCost(usage1k500, route, "SUCCESS");
    expect(costUsd).toBe(0);
    expect(sellUsd).toBe(0);
  });
});

describe("F-BIPOR-03 sellPrice markup verification (1.2 ±1% tolerance)", () => {
  it("sell / cost ratio is 1.2 within 1% across all 6 OR channels (spec § 3.1)", () => {
    const cases = [
      { input: 0.3, output: 2.5 },
      { input: 2.0, output: 12.0 },
      { input: 0.5, output: 3.0 },
      { input: 10.0, output: 10.0 },
      { input: 2.5, output: 2.0 },
      { input: 8.0, output: 15.0 },
    ];
    for (const c of cases) {
      const { costUsd, sellUsd } = calculateTokenCost(
        usage1k500,
        makeOrRoute(c.input, c.output),
        "SUCCESS",
      );
      // sellPrice 在 channel.sellPrice 上是 ×1.2，但 calculateTokenCost 优先
      // 取 alias.sellPrice，alias 为 null 时 fallback 到 channel.sellPrice。
      // 我们故意 alias.sellPrice=null，所以走 channel.sellPrice → 1.2× cost。
      if (costUsd > 0) {
        const ratio = sellUsd / costUsd;
        expect(ratio).toBeGreaterThanOrEqual(1.19);
        expect(ratio).toBeLessThanOrEqual(1.21);
      }
    }
  });
});
