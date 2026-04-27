/**
 * calculateTokenCost — null-guard regression for post-process.
 *
 * Round6 root cause: route.channel.costPrice or .sellPrice could be null
 * (未配置定价 channel/alias)，触发 `TypeError: reading inputPer1M of null`，
 * 导致 post-process 抛错、callLog 未落库、totalCostUsd 对账失败。
 *
 * Fix: cast via `(x ?? {})` so every field access falls through to the
 * existing `?? 0` guard, returning { costUsd: 0, sellUsd: 0 }.
 */
import { describe, it, expect } from "vitest";
import { calculateTokenCost } from "../post-process";
import type { RouteResult, Usage } from "../../engine/types";

function makeRoute(overrides?: {
  channelCostPrice?: unknown;
  channelSellPrice?: unknown;
  aliasSellPrice?: unknown;
}): RouteResult {
  return {
    channel: {
      id: "ch_1",
      costPrice: overrides?.channelCostPrice ?? null,
      sellPrice: overrides?.channelSellPrice ?? null,
    },
    alias:
      overrides?.aliasSellPrice !== undefined
        ? { alias: "gpt-4o", sellPrice: overrides.aliasSellPrice }
        : null,
    config: { currency: "USD" },
    model: { capabilities: null },
  } as unknown as RouteResult;
}

const usage: Usage = {
  prompt_tokens: 1000,
  completion_tokens: 500,
  total_tokens: 1500,
};

describe("calculateTokenCost null-guard (F-FQ-02 round 6 fix)", () => {
  it("returns zero cost when costPrice and sellPrice are both null", () => {
    const { costUsd, sellUsd } = calculateTokenCost(usage, makeRoute(), "SUCCESS");
    expect(costUsd).toBe(0);
    expect(sellUsd).toBe(0);
  });

  it("returns zero when only channel.sellPrice exists but no alias and costPrice null", () => {
    const { costUsd, sellUsd } = calculateTokenCost(
      usage,
      makeRoute({
        channelSellPrice: { inputPer1M: 10, outputPer1M: 20 },
      }),
      "SUCCESS",
    );
    expect(costUsd).toBe(0); // costPrice is null → 0
    expect(sellUsd).toBeCloseTo((1000 / 1_000_000) * 10 + (500 / 1_000_000) * 20, 10);
  });

  it("prefers alias.sellPrice over channel.sellPrice when both set", () => {
    const { sellUsd } = calculateTokenCost(
      usage,
      makeRoute({
        aliasSellPrice: { inputPer1M: 100, outputPer1M: 200 },
        channelSellPrice: { inputPer1M: 1, outputPer1M: 2 },
      }),
      "SUCCESS",
    );
    expect(sellUsd).toBeCloseTo((1000 / 1_000_000) * 100 + (500 / 1_000_000) * 200, 10);
  });

  it("does not throw when no usage provided", () => {
    const result = calculateTokenCost(null, makeRoute(), "SUCCESS");
    expect(result).toEqual({ costUsd: 0, sellUsd: 0 });
  });

  it("returns zero for ERROR status regardless of prices", () => {
    const result = calculateTokenCost(
      usage,
      makeRoute({
        channelCostPrice: { inputPer1M: 10, outputPer1M: 20 },
        channelSellPrice: { inputPer1M: 10, outputPer1M: 20 },
      }),
      "ERROR",
    );
    expect(result).toEqual({ costUsd: 0, sellUsd: 0 });
  });

  it("FILTERED only bills input tokens", () => {
    const { sellUsd } = calculateTokenCost(
      usage,
      makeRoute({
        aliasSellPrice: { inputPer1M: 100, outputPer1M: 200 },
      }),
      "FILTERED",
    );
    // only prompt_tokens (1000) billed
    expect(sellUsd).toBeCloseTo((1000 / 1_000_000) * 100, 10);
  });
});

// BL-RECON-FIX-PHASE2 F-RP-02: usage.upstreamCostUsd 短路分支
describe("calculateTokenCost upstreamCostUsd short-circuit (F-RP-02)", () => {
  const route = {
    channel: {
      id: "ch_or",
      // 实测生产配置（image-via-chat token-priced）
      costPrice: { unit: "token", inputPer1M: 0.3, outputPer1M: 2.5 },
      sellPrice: { unit: "token", inputPer1M: 0.36, outputPer1M: 3 },
    },
    alias: null,
    config: { currency: "USD" },
    model: { capabilities: null },
  } as unknown as RouteResult;

  // 实测 OR gemini-2.5-flash-image 响应 shape
  const imageUsage: Usage = {
    prompt_tokens: 7,
    completion_tokens: 1304,
    total_tokens: 1311,
    upstreamCostUsd: 0.0387371,
  };

  it("uses upstreamCostUsd as costUsd when present and >0 (SUCCESS)", () => {
    const { costUsd } = calculateTokenCost(imageUsage, route, "SUCCESS");
    expect(costUsd).toBe(0.0387371);
    // 验证落在 spec acceptance 区间 [$0.030, $0.045]
    expect(costUsd).toBeGreaterThanOrEqual(0.03);
    expect(costUsd).toBeLessThanOrEqual(0.045);
  });

  it("sellUsd remains formula-based (product pricing decision unchanged)", () => {
    const { sellUsd } = calculateTokenCost(imageUsage, route, "SUCCESS");
    // 7*0.36/1M + 1304*3/1M = 2.52e-6 + 0.003912 ≈ 0.00391452
    expect(sellUsd).toBeCloseTo((7 / 1_000_000) * 0.36 + (1304 / 1_000_000) * 3, 10);
  });

  it("falls back to token-formula when upstreamCostUsd absent (text-only chat regression)", () => {
    const textUsage: Usage = {
      prompt_tokens: 1000,
      completion_tokens: 500,
      total_tokens: 1500,
      // no upstreamCostUsd — pure text response
    };
    const { costUsd } = calculateTokenCost(textUsage, route, "SUCCESS");
    // formula: 1000*0.3/1M + 500*2.5/1M = 3e-4 + 1.25e-3 = 1.55e-3
    expect(costUsd).toBeCloseTo((1000 / 1_000_000) * 0.3 + (500 / 1_000_000) * 2.5, 10);
  });

  it("falls back to token-formula when upstreamCostUsd is 0 or negative", () => {
    const zeroUsage: Usage = { ...imageUsage, upstreamCostUsd: 0 };
    const negUsage: Usage = { ...imageUsage, upstreamCostUsd: -1 };
    const tokenFormula = (7 / 1_000_000) * 0.3 + (1304 / 1_000_000) * 2.5;
    expect(calculateTokenCost(zeroUsage, route, "SUCCESS").costUsd).toBeCloseTo(tokenFormula, 10);
    expect(calculateTokenCost(negUsage, route, "SUCCESS").costUsd).toBeCloseTo(tokenFormula, 10);
  });

  it("FILTERED never uses upstreamCostUsd (charge only input tokens)", () => {
    // FILTERED 只算 input；upstreamCostUsd 短路只在 SUCCESS 生效
    const { costUsd } = calculateTokenCost(imageUsage, route, "FILTERED");
    // 7*0.3/1M = 2.1e-6
    expect(costUsd).toBeCloseTo((7 / 1_000_000) * 0.3, 10);
  });

  it("ERROR status returns zero regardless of upstreamCostUsd", () => {
    const result = calculateTokenCost(imageUsage, route, "ERROR");
    expect(result).toEqual({ costUsd: 0, sellUsd: 0 });
  });
});
