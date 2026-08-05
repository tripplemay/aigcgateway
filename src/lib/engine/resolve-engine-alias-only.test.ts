/**
 * BL-SEC-HOTFIX-2608 F-SH-03 — resolveEngine 只认别名（审查 C6 回归）。
 *
 * 修复前 resolveEngine 在 routeByAlias 抛 MODEL_NOT_FOUND 时会回退到
 * routeByModelName，按底层 Model.name 路由。该回退返回的 route 不含 alias，
 * 而 alias 是网关唯一卖价来源（sync 不写 channel.sellPrice），导致：
 *   - sellUsd 恒为 0 → 调用成功但完全不扣费（零计费旁路）
 *   - alias.enabled=false 的停用开关失效（停用恰好抛 MODEL_NOT_FOUND → 落进回退）
 *   - route.alias 缺失 → modality 门禁被跳过
 *
 * 本测试锁死：别名不存在 / 别名已停用 时一律抛 MODEL_NOT_FOUND，
 * 绝不因为存在同名的启用 Model 而被放行。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    modelAlias: { findUnique: vi.fn() },
    channel: { findFirst: vi.fn() },
    model: { findUnique: vi.fn() },
  },
}));
vi.mock("./cooldown", () => ({
  getCooldownChannelIds: vi.fn().mockResolvedValue(new Set<string>()),
  isTransientFailureReason: () => false,
}));

import { resolveEngine } from "./router";
import { prisma } from "@/lib/prisma";
import { EngineError, ErrorCodes } from "./types";

const aliasFindUnique = prisma.modelAlias.findUnique as unknown as ReturnType<typeof vi.fn>;
const modelFindUnique = prisma.model.findUnique as unknown as ReturnType<typeof vi.fn>;
const channelFindFirst = prisma.channel.findFirst as unknown as ReturnType<typeof vi.fn>;

/** 一条完全可用的底层 Model + ACTIVE channel —— 修复前正是它让旁路得以成立 */
function armEnabledUnderlyingModel(name: string) {
  modelFindUnique.mockResolvedValue({ id: "m1", name, enabled: true, modality: "TEXT" });
  channelFindFirst.mockResolvedValue({
    id: "ch1",
    priority: 1,
    status: "ACTIVE",
    realModelId: name,
    costPrice: { inputPer1M: 0.14, outputPer1M: 0.28, unit: "token" },
    sellPrice: null, // sync 不写 channel.sellPrice —— 零计费的根因
    provider: {
      id: "p1",
      name: "openai",
      adapterType: "openai-compat",
      config: { id: "c1", currency: "USD" },
    },
  });
}

function armAliasRow(row: unknown) {
  aliasFindUnique.mockResolvedValue(row);
}

beforeEach(() => {
  aliasFindUnique.mockReset();
  modelFindUnique.mockReset();
  channelFindFirst.mockReset();
});

describe("F-SH-03 resolveEngine 只认别名", () => {
  it("别名不存在，但存在同名的启用 Model + ACTIVE channel → 仍须 404，不得回退", async () => {
    // routeByAlias 的 findUnique 带 enabled:true 过滤，别名不存在时返回 null
    armAliasRow(null);
    armEnabledUnderlyingModel("gpt-4o-2024-08-06");

    await expect(resolveEngine("gpt-4o-2024-08-06")).rejects.toMatchObject({
      code: ErrorCodes.MODEL_NOT_FOUND,
    });
    // 关键断言：根本没去查底层模型 —— 回退路径已不存在
    expect(modelFindUnique).not.toHaveBeenCalled();
    expect(channelFindFirst).not.toHaveBeenCalled();
  });

  it("别名被管理员停用（enabled=false）→ 须 404，停用开关必须真的生效", async () => {
    // enabled:true 的过滤条件使停用别名同样返回 null
    armAliasRow(null);
    armEnabledUnderlyingModel("deepseek-chat");

    await expect(resolveEngine("deepseek-chat")).rejects.toBeInstanceOf(EngineError);
    expect(modelFindUnique).not.toHaveBeenCalled();
  });

  it("正常启用别名 → 照常路由，且 route 带 alias（卖价来源在位）", async () => {
    armAliasRow({
      id: "a1",
      alias: "gpt-4o",
      enabled: true,
      modality: "TEXT",
      sellPrice: { inputPer1M: 0.5, outputPer1M: 1.5, unit: "token" },
      capabilities: {},
      models: [
        {
          model: {
            id: "m1",
            name: "gpt-4o-2024-08-06",
            enabled: true,
            modality: "TEXT",
            channels: [
              {
                id: "ch1",
                priority: 1,
                status: "ACTIVE",
                realModelId: "gpt-4o-2024-08-06",
                provider: {
                  id: "p1",
                  name: "openai",
                  adapterType: "openai-compat",
                  config: { id: "c1", currency: "USD" },
                },
                healthChecks: [{ result: "PASS", errorMessage: null }],
              },
            ],
          },
        },
      ],
    });

    const resolved = await resolveEngine("gpt-4o");
    expect(resolved.route.channel.id).toBe("ch1");
    expect(resolved.route.alias?.alias).toBe("gpt-4o");
    expect(resolved.route.alias?.sellPrice).toBeTruthy();
    expect(resolved.candidates.length).toBe(1);
  });
});
