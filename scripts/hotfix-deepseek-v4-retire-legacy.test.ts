import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { deepseekAdapter } from "../src/lib/sync/adapters/deepseek";
import { retireLegacyDeepseekChannels } from "./hotfix-deepseek-v4-retire-legacy";

type TestChannel = {
  id: string;
  realModelId: string;
  status: "ACTIVE" | "DEGRADED" | "DISABLED";
  priority: number;
  model: {
    name: string;
    aliasLinks: Array<{ alias: { alias: string; enabled: boolean } }>;
  };
};

function channel(id: string, realModelId: string, status: TestChannel["status"]): TestChannel {
  return {
    id,
    realModelId,
    status,
    priority: 1,
    model: {
      name: id,
      aliasLinks: [{ alias: { alias: id, enabled: true } }],
    },
  };
}

function prismaMock(channels: TestChannel[], updated = 0) {
  const findMany = vi.fn().mockResolvedValue(channels);
  const updateMany = vi.fn().mockResolvedValue({ count: updated });
  const client = {
    provider: {
      findUnique: vi.fn().mockResolvedValue({ id: "provider-deepseek", name: "deepseek", config: {} }),
    },
    channel: { findMany, updateMany },
  };
  return { client: client as unknown as PrismaClient, findMany, updateMany };
}

function upstream(...modelIds: string[]) {
  return modelIds.map((modelId) => ({
    modelId,
    name: modelId,
    displayName: modelId,
    modality: "TEXT" as const,
  }));
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("F-DSV4-01 retireLegacyDeepseekChannels", () => {
  it("上游拉取失败时 fail closed，查询通道和写库均不发生", async () => {
    vi.spyOn(deepseekAdapter, "fetchModels").mockRejectedValue(new Error("upstream unavailable"));
    const { client, findMany, updateMany } = prismaMock([]);

    await expect(retireLegacyDeepseekChannels(client, true)).rejects.toThrow(
      /上游 \/models 拉取失败.*不做任何写入/,
    );
    expect(findMany).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("上游返回空集合时 fail closed，查询通道和写库均不发生", async () => {
    vi.spyOn(deepseekAdapter, "fetchModels").mockResolvedValue([]);
    const { client, findMany, updateMany } = prismaMock([]);

    await expect(retireLegacyDeepseekChannels(client, true)).rejects.toThrow(
      /返回 0 个模型.*不做任何写入/,
    );
    expect(findMany).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("dry-run 只盘点 ACTIVE/DEGRADED 陈旧通道，不写库", async () => {
    vi.spyOn(deepseekAdapter, "fetchModels").mockResolvedValue(upstream("deepseek-v4-pro"));
    const { client, updateMany } = prismaMock([
      channel("legacy-active", "deepseek-chat", "ACTIVE"),
      channel("legacy-disabled", "deepseek-reasoner", "DISABLED"),
      channel("v4", "deepseek-v4-pro", "ACTIVE"),
    ]);

    const result = await retireLegacyDeepseekChannels(client, false);

    expect(result.stale.map((item) => item.id)).toEqual(["legacy-active"]);
    expect(result.kept.map((item) => item.id)).toEqual(["v4"]);
    expect(result.disabledCount).toBe(0);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("apply 仅下架不在上游集合内的 live 通道", async () => {
    vi.spyOn(deepseekAdapter, "fetchModels").mockResolvedValue(
      upstream("deepseek-v4-pro", "deepseek-v4-flash"),
    );
    const { client, updateMany } = prismaMock(
      [
        channel("legacy-active", "deepseek-chat", "ACTIVE"),
        channel("legacy-degraded", "deepseek-reasoner", "DEGRADED"),
        channel("legacy-disabled", "deepseek-chat", "DISABLED"),
        channel("v4-pro", "deepseek-v4-pro", "ACTIVE"),
        channel("v4-flash", "deepseek-v4-flash", "ACTIVE"),
      ],
      2,
    );

    const result = await retireLegacyDeepseekChannels(client, true);

    expect(result.disabledCount).toBe(2);
    expect(updateMany).toHaveBeenCalledOnce();
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["legacy-active", "legacy-degraded"] } },
      data: { status: "DISABLED" },
    });
  });

  it("无陈旧 live 通道时重跑为 0 变更", async () => {
    vi.spyOn(deepseekAdapter, "fetchModels").mockResolvedValue(
      upstream("deepseek-v4-pro", "deepseek-v4-flash"),
    );
    const { client, updateMany } = prismaMock([
      channel("legacy-disabled", "deepseek-chat", "DISABLED"),
      channel("v4-pro", "deepseek-v4-pro", "ACTIVE"),
      channel("v4-flash", "deepseek-v4-flash", "ACTIVE"),
    ]);

    const result = await retireLegacyDeepseekChannels(client, true);

    expect(result.stale).toHaveLength(0);
    expect(result.disabledCount).toBe(0);
    expect(updateMany).not.toHaveBeenCalled();
  });
});
