/**
 * F-BIPOR-01 OR image channel pricing 脚本单测。
 *
 * 验证：
 *   1) 6 条 spec § 3.1 全部覆盖 + sellPrice 比值 = 1.2（±1e-6）
 *   2) dry-run 不写库；apply=true 才执行 update
 *   3) 幂等：当前已是目标值 → skipped=true，无 update
 *   4) tokenPriceMatches 容差行为（同 P1 priceMatches）
 *   5) DB drift（channel 不存在）容错
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const findUniqueChannelMock = vi.fn();
const updateChannelMock = vi.fn();
const disconnectMock = vi.fn();

vi.mock("../../../src/lib/prisma", () => ({
  prisma: {
    channel: {
      findUnique: (a: unknown) => findUniqueChannelMock(a),
      update: (a: unknown) => updateChannelMock(a),
    },
    $disconnect: () => disconnectMock(),
  },
}));

import {
  runOrPricingFix,
  tokenPriceMatches,
  OR_IMAGE_PRICES,
} from "../fix-or-image-channels-2026-04-25";

beforeEach(() => {
  findUniqueChannelMock.mockReset();
  updateChannelMock.mockReset();
  disconnectMock.mockReset();
  // pre-fix state: token unit but all-zero (typical state after F-BAX-08
  // skipped these 6 OR channels).
  findUniqueChannelMock.mockImplementation(async (args: { where: { id: string } }) => ({
    id: args.where.id,
    costPrice: { unit: "token", inputPer1M: 0, outputPer1M: 0 },
    sellPrice: { unit: "token", inputPer1M: 0, outputPer1M: 0 },
  }));
  updateChannelMock.mockResolvedValue({});
});

describe("F-BIPOR-01 OR pricing constants", () => {
  it("covers exactly 6 channels per spec § 3.1", () => {
    expect(OR_IMAGE_PRICES).toHaveLength(6);
  });

  it("model names match the OR /api/v1/models canonical IDs", () => {
    const names = OR_IMAGE_PRICES.map((e) => e.model).sort();
    expect(names).toEqual([
      "google/gemini-2.5-flash-image",
      "google/gemini-3-pro-image-preview",
      "google/gemini-3.1-flash-image-preview",
      "openai/gpt-5-image",
      "openai/gpt-5-image-mini",
      "openai/gpt-5.4-image-2",
    ]);
  });
});

describe("F-BIPOR-01 runOrPricingFix", () => {
  it("dry-run prints diff but does NOT call update", async () => {
    const { diffs } = await runOrPricingFix({ apply: false });
    expect(updateChannelMock).not.toHaveBeenCalled();
    expect(diffs).toHaveLength(6);
    expect(diffs.every((d) => !d.skipped)).toBe(true);
    // every entry's `after.sellPrice` is 1.2 × cost (±1e-6 tolerance, 铁律 1.3)
    for (const d of diffs) {
      expect(d.after.sellPrice.inputPer1M).toBeCloseTo(d.after.costPrice.inputPer1M * 1.2, 6);
      expect(d.after.sellPrice.outputPer1M).toBeCloseTo(d.after.costPrice.outputPer1M * 1.2, 6);
    }
  });

  it("apply=true calls update for non-skipped entries", async () => {
    await runOrPricingFix({ apply: true });
    expect(updateChannelMock).toHaveBeenCalledTimes(6);
    const firstCall = updateChannelMock.mock.calls[0][0];
    expect(firstCall.data.costPrice.unit).toBe("token");
    expect(firstCall.data.sellPrice.unit).toBe("token");
  });

  it("idempotent: when current matches target → skipped=true, no update", async () => {
    findUniqueChannelMock.mockImplementation(async (args: { where: { id: string } }) => {
      const entry = OR_IMAGE_PRICES.find((e) => e.channelId === args.where.id)!;
      return {
        id: args.where.id,
        costPrice: { unit: "token", inputPer1M: entry.inputPer1M, outputPer1M: entry.outputPer1M },
        sellPrice: {
          unit: "token",
          inputPer1M: entry.inputPer1M * 1.2,
          outputPer1M: entry.outputPer1M * 1.2,
        },
      };
    });

    const { diffs } = await runOrPricingFix({ apply: true });
    expect(updateChannelMock).not.toHaveBeenCalled();
    expect(diffs.every((d) => d.skipped)).toBe(true);
  });

  it("DB drift (channel missing) → warn + continue, no update", async () => {
    findUniqueChannelMock.mockResolvedValue(null);
    const { diffs } = await runOrPricingFix({ apply: true });
    expect(diffs).toHaveLength(0);
    expect(updateChannelMock).not.toHaveBeenCalled();
  });
});

describe("F-BIPOR-01 tokenPriceMatches", () => {
  it("matches identical struct", () => {
    expect(
      tokenPriceMatches(
        { unit: "token", inputPer1M: 0.3, outputPer1M: 2.5 },
        { unit: "token", inputPer1M: 0.3, outputPer1M: 2.5 },
      ),
    ).toBe(true);
  });

  it("rejects unit mismatch", () => {
    expect(
      tokenPriceMatches(
        { unit: "call", inputPer1M: 0.3, outputPer1M: 2.5 },
        { unit: "token", inputPer1M: 0.3, outputPer1M: 2.5 },
      ),
    ).toBe(false);
  });

  it("respects ±1e-6 tolerance", () => {
    expect(
      tokenPriceMatches(
        { unit: "token", inputPer1M: 0.3000005, outputPer1M: 2.5 },
        { unit: "token", inputPer1M: 0.3, outputPer1M: 2.5 },
      ),
    ).toBe(true);
  });

  it("rejects drift beyond tolerance", () => {
    expect(
      tokenPriceMatches(
        { unit: "token", inputPer1M: 0.31, outputPer1M: 2.5 },
        { unit: "token", inputPer1M: 0.3, outputPer1M: 2.5 },
      ),
    ).toBe(false);
  });

  it("rejects null / missing fields", () => {
    expect(tokenPriceMatches(null, { unit: "token", inputPer1M: 0.3, outputPer1M: 2.5 })).toBe(false);
    expect(
      tokenPriceMatches(
        { unit: "token", inputPer1M: 0.3 },
        { unit: "token", inputPer1M: 0.3, outputPer1M: 2.5 },
      ),
    ).toBe(false);
  });
});
