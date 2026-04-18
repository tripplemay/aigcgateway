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
    alias: overrides?.aliasSellPrice !== undefined
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
    expect(sellUsd).toBeCloseTo(1000 / 1_000_000 * 10 + 500 / 1_000_000 * 20, 10);
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
    expect(sellUsd).toBeCloseTo(1000 / 1_000_000 * 100 + 500 / 1_000_000 * 200, 10);
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
    expect(sellUsd).toBeCloseTo(1000 / 1_000_000 * 100, 10);
  });
});
