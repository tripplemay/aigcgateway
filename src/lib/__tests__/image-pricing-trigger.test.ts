/**
 * BL-IMAGE-PRICING-OR-P2 F-BIPOR-02 — DB trigger 集成测试。
 *
 * 用真实 dev DB 跑 INSERT/UPDATE 触发器路径，断言：
 *   1) IMAGE channel 写 costPrice=call.perCall=0 → check_violation
 *   2) IMAGE channel 写 costPrice=token 全 0 → check_violation
 *   3) IMAGE channel 写 costPrice=token.inputPer1M>0 → 通过
 *   4) TEXT channel 同样改 → 通过（trigger 只校验 IMAGE）
 *
 * 没有 IMAGE/TEXT 数据时跑时 skip（CI 空 DB 场景）。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";

let imageChannelId: string | null = null;
let imageOriginalCostPrice: unknown = null;
let textChannelId: string | null = null;
let textOriginalCostPrice: unknown = null;

beforeAll(async () => {
  const imgCh = await prisma.channel.findFirst({
    where: { model: { modality: "IMAGE" } },
    select: { id: true, costPrice: true },
  });
  if (imgCh) {
    imageChannelId = imgCh.id;
    imageOriginalCostPrice = imgCh.costPrice;
  }
  const txtCh = await prisma.channel.findFirst({
    where: { model: { modality: "TEXT" } },
    select: { id: true, costPrice: true },
  });
  if (txtCh) {
    textChannelId = txtCh.id;
    textOriginalCostPrice = txtCh.costPrice;
  }
});

afterAll(async () => {
  if (imageChannelId && imageOriginalCostPrice !== null) {
    await prisma.channel.update({
      where: { id: imageChannelId },
      data: { costPrice: imageOriginalCostPrice as object },
    });
  }
  if (textChannelId && textOriginalCostPrice !== null) {
    await prisma.channel.update({
      where: { id: textChannelId },
      data: { costPrice: textOriginalCostPrice as object },
    });
  }
  await prisma.$disconnect();
});

describe("F-BIPOR-02 trg_validate_image_channel_pricing", () => {
  it("IMAGE channel + costPrice={call, perCall:0} → check_violation", async (ctx) => {
    if (!imageChannelId) return ctx.skip();
    await expect(
      prisma.channel.update({
        where: { id: imageChannelId },
        data: { costPrice: { unit: "call", perCall: 0 } },
      }),
    ).rejects.toThrow();
  });

  it("IMAGE channel + costPrice={token, all-zero} → check_violation", async (ctx) => {
    if (!imageChannelId) return ctx.skip();
    await expect(
      prisma.channel.update({
        where: { id: imageChannelId },
        data: { costPrice: { unit: "token", inputPer1M: 0, outputPer1M: 0 } },
      }),
    ).rejects.toThrow();
  });

  it("IMAGE channel + costPrice={token, inputPer1M>0} → passes", async (ctx) => {
    if (!imageChannelId) return ctx.skip();
    await expect(
      prisma.channel.update({
        where: { id: imageChannelId },
        data: { costPrice: { unit: "token", inputPer1M: 0.3, outputPer1M: 0 } },
      }),
    ).resolves.toBeDefined();
  });

  it("TEXT channel + costPrice={call, perCall:0} → passes (trigger only guards IMAGE)", async (ctx) => {
    if (!textChannelId) return ctx.skip();
    await expect(
      prisma.channel.update({
        where: { id: textChannelId },
        data: { costPrice: { unit: "call", perCall: 0 } },
      }),
    ).resolves.toBeDefined();
  });
});
