/**
 * BL-BILLING-AUDIT-EXT-P1 F-BAX-08 — 定价脚本幂等 + dry-run 单测。
 *
 * 验证 runPricingFix：
 *   1) dry-run 不写库，输出 diff；apply=true 才执行 UPDATE
 *   2) 幂等：当前值已匹配目标值 → skipped=true，不产生 update
 *   3) 定价表完整覆盖 spec § 3.1（30 条）+ modality 列表完整（4 条）
 *   4) priceMatches 对 null / undefined / 不同结构返回 false
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const findUniqueChannelMock = vi.fn();
const updateChannelMock = vi.fn();
const findUniqueModelMock = vi.fn();
const updateModelMock = vi.fn();
const disconnectMock = vi.fn();

vi.mock("../../../src/lib/prisma", () => ({
  prisma: {
    channel: {
      findUnique: (args: unknown) => findUniqueChannelMock(args),
      update: (args: unknown) => updateChannelMock(args),
    },
    model: {
      findUnique: (args: unknown) => findUniqueModelMock(args),
      update: (args: unknown) => updateModelMock(args),
    },
    $disconnect: () => disconnectMock(),
  },
}));

import {
  runPricingFix,
  priceMatches,
  IMAGE_CHANNEL_PRICES,
  MODALITY_FIX_MODELS,
} from "../fix-image-channels-2026-04-24";

beforeEach(() => {
  findUniqueChannelMock.mockReset();
  updateChannelMock.mockReset();
  findUniqueModelMock.mockReset();
  updateModelMock.mockReset();
  disconnectMock.mockReset();
  // default: all channels / models exist with zero costPrice (pre-fix state)
  findUniqueChannelMock.mockImplementation(async (args: { where: { id: string } }) => ({
    id: args.where.id,
    costPrice: { unit: "call", perCall: 0 },
    sellPrice: { unit: "call", perCall: 0 },
  }));
  findUniqueModelMock.mockImplementation(async (args: { where: { name: string } }) => ({
    name: args.where.name,
    modality: "IMAGE",
  }));
  updateChannelMock.mockResolvedValue({});
  updateModelMock.mockResolvedValue({});
});

describe("F-BAX-08 runPricingFix", () => {
  it("covers all 30 channels + 4 modality models per spec § 3.1 / 3.2", () => {
    expect(IMAGE_CHANNEL_PRICES).toHaveLength(30);
    expect(MODALITY_FIX_MODELS).toEqual([
      "gpt-4.1-vision",
      "gpt-4o-vision",
      "gpt-4o-mini-vision",
      "glm-4v",
    ]);
  });

  it("sellPrice / costPrice ratio is within 1.19-1.21 for every channel entry", () => {
    for (const entry of IMAGE_CHANNEL_PRICES) {
      const ratio = entry.sellPerCall / entry.costPerCall;
      expect(ratio).toBeGreaterThanOrEqual(1.19);
      expect(ratio).toBeLessThanOrEqual(1.21);
    }
  });

  it("dry-run prints diff but does NOT call update", async () => {
    const { channelDiffs, modalityChanges } = await runPricingFix({ apply: false });

    expect(updateChannelMock).not.toHaveBeenCalled();
    expect(updateModelMock).not.toHaveBeenCalled();
    expect(channelDiffs).toHaveLength(30);
    expect(modalityChanges).toHaveLength(4);
    // every channel starts with perCall=0 so none should be skipped
    expect(channelDiffs.every((d) => !d.skipped)).toBe(true);
  });

  it("apply=true calls update for non-skipped entries", async () => {
    await runPricingFix({ apply: true });
    expect(updateChannelMock).toHaveBeenCalledTimes(30);
    expect(updateModelMock).toHaveBeenCalledTimes(4);
    // verify first update uses expected shape
    const firstCall = updateChannelMock.mock.calls[0][0];
    expect(firstCall.data.costPrice.unit).toBe("call");
    expect(firstCall.data.costPrice.perCall).toBe(0.037);
    expect(firstCall.data.sellPrice.perCall).toBe(0.0444);
  });

  it("idempotent: when current matches target → skipped=true, no update call", async () => {
    // Simulate post-apply state: return expected prices for every channel
    findUniqueChannelMock.mockImplementation(async (args: { where: { id: string } }) => {
      const entry = IMAGE_CHANNEL_PRICES.find((e) => e.channelId === args.where.id)!;
      return {
        id: args.where.id,
        costPrice: { unit: "call", perCall: entry.costPerCall },
        sellPrice: { unit: "call", perCall: entry.sellPerCall },
      };
    });
    findUniqueModelMock.mockImplementation(async (args: { where: { name: string } }) => ({
      name: args.where.name,
      modality: "TEXT",
    }));

    const { channelDiffs, modalityChanges } = await runPricingFix({ apply: true });

    expect(updateChannelMock).not.toHaveBeenCalled();
    expect(updateModelMock).not.toHaveBeenCalled();
    expect(channelDiffs.every((d) => d.skipped)).toBe(true);
    expect(modalityChanges.every((m) => m.skipped)).toBe(true);
  });

  it("handles missing channels (DB drift) by warning + continuing", async () => {
    findUniqueChannelMock.mockResolvedValue(null);
    findUniqueModelMock.mockResolvedValue(null);

    const { channelDiffs, modalityChanges } = await runPricingFix({ apply: true });

    expect(channelDiffs).toHaveLength(0);
    expect(modalityChanges).toHaveLength(0);
    expect(updateChannelMock).not.toHaveBeenCalled();
    expect(updateModelMock).not.toHaveBeenCalled();
  });
});

describe("F-BAX-08 priceMatches", () => {
  it("matches identical struct", () => {
    expect(
      priceMatches({ unit: "call", perCall: 0.037 }, { unit: "call", perCall: 0.037 }),
    ).toBe(true);
  });

  it("rejects unit mismatch", () => {
    expect(
      priceMatches({ unit: "token", perCall: 0.037 }, { unit: "call", perCall: 0.037 }),
    ).toBe(false);
  });

  it("rejects perCall drift beyond tolerance", () => {
    expect(
      priceMatches({ unit: "call", perCall: 0.038 }, { unit: "call", perCall: 0.037 }),
    ).toBe(false);
  });

  it("rejects null", () => {
    expect(priceMatches(null, { unit: "call", perCall: 0.037 })).toBe(false);
  });

  it("rejects missing perCall", () => {
    expect(priceMatches({ unit: "call" }, { unit: "call", perCall: 0.037 })).toBe(false);
  });
});
