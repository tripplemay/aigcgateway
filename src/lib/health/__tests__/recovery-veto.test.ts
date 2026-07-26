/**
 * BL-DEEPSEEK-V4-HOTFIX fix_round 3 — DSV4-DEF-03 回归。
 *
 * 事故：DISABLED 通道的恢复检查走零成本 API_REACHABILITY，只验 provider 的
 * /models 端点有响应，根本不碰 channel 自己的 realModelId。于是 2026-07-26
 * 08:44/08:45 把两条按上游目录下架的 DeepSeek 陈旧通道又拉回 ACTIVE，
 * 直接撤销了 F-DSV4-01 的生产止血 —— F-DSV4-02 修好的调度器把 F-DSV4-01 的
 * 成果抹了。
 *
 * 修复语义：只在**能确证模型已从服务商目录消失**时否决恢复。
 *
 * 护栏来自上线前的生产实测（每个 provider 的 /models 对比其通道）：
 *   zhipu 16 条 ACTIVE 通道的 realModelId 不在自家 /models 里却能调通；
 *   volcengine 用接入点 ID（ep-…）与目录命名不是一套；
 *   siliconflow 的 bge-m3 属 EMBEDDING，本就不在 chat 目录里。
 * 所以"缺席"不是通用下架信号，必须逐条排除不可比情形 —— 宁可漏否决，
 * 不可把还能用的通道永久钉死。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma, fetchModels, getSyncAdapter, writeSystemLog } = vi.hoisted(() => ({
  mockPrisma: { provider: { findUnique: vi.fn() } },
  fetchModels: vi.fn(),
  getSyncAdapter: vi.fn(),
  writeSystemLog: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/system-logger", () => ({
  writeSystemLog: (...a: unknown[]) => writeSystemLog(...a),
}));
vi.mock("@/lib/sync/model-sync", () => ({
  getSyncAdapter: (...a: unknown[]) => getSyncAdapter(...a),
}));

import { __recoveryTesting } from "../scheduler";

const { vetoRecovery } = __recoveryTesting;

interface RouteOpts {
  realModelId?: string;
  modality?: string;
  providerName?: string;
  quirks?: Record<string, unknown> | null;
}

function route(o: RouteOpts = {}) {
  return {
    channel: { id: "ch-1", realModelId: o.realModelId ?? "deepseek-chat", status: "DISABLED" },
    provider: { id: "p-1", name: o.providerName ?? "deepseek" },
    config: { quirks: o.quirks ?? null },
    model: { modality: o.modality ?? "TEXT" },
  } as never;
}

beforeEach(() => {
  writeSystemLog.mockReset().mockResolvedValue(undefined);
  fetchModels.mockReset();
  getSyncAdapter.mockReset().mockReturnValue({ fetchModels });
  mockPrisma.provider.findUnique.mockReset().mockResolvedValue({ id: "p-1", config: {} });
});

describe("否决：模型确已从目录消失（事故本体）", () => {
  it("deepseek-chat 不在 /models 里 → 否决恢复", async () => {
    fetchModels.mockResolvedValue([{ modelId: "deepseek-v4-flash" }, { modelId: "deepseek-v4-pro" }]);

    const veto = await vetoRecovery(route({ realModelId: "deepseek-chat" }));

    expect(veto).toBeTruthy();
    expect(veto).toContain("deepseek");
  });

  it("deepseek-reasoner 同样被否决", async () => {
    fetchModels.mockResolvedValue([{ modelId: "deepseek-v4-flash" }, { modelId: "deepseek-v4-pro" }]);
    expect(await vetoRecovery(route({ realModelId: "deepseek-reasoner" }))).toBeTruthy();
  });

  it("模型仍在目录中 → 放行", async () => {
    fetchModels.mockResolvedValue([{ modelId: "deepseek-v4-flash" }]);
    expect(await vetoRecovery(route({ realModelId: "deepseek-v4-flash" }))).toBeNull();
  });
});

describe("护栏：不可比情形一律放行（宁可漏否决）", () => {
  it("EMBEDDING 不走 chat /models，缺席是常态 → 放行", async () => {
    fetchModels.mockResolvedValue([{ modelId: "other" }]);
    expect(
      await vetoRecovery(route({ realModelId: "BAAI/bge-m3", modality: "EMBEDDING" })),
    ).toBeNull();
  });

  it("provider 使用接入点 ID 映射（volcengine quirks.endpointMap）→ 放行", async () => {
    fetchModels.mockResolvedValue([{ modelId: "doubao-pro" }]);
    expect(
      await vetoRecovery(
        route({
          providerName: "volcengine",
          realModelId: "ep-20260604162024-k2sbk",
          quirks: { endpointMap: { "seedream-4-5": "ep-20260604162024-k2sbk" } },
        }),
      ),
    ).toBeNull();
  });

  it("无专属适配器（目录不权威）→ 放行", async () => {
    getSyncAdapter.mockReturnValue(undefined);
    expect(await vetoRecovery(route({ providerName: "guangtech" }))).toBeNull();
  });

  it("目录拉取失败 → 放行，不据此否决", async () => {
    fetchModels.mockRejectedValue(new Error("upstream 500"));
    expect(await vetoRecovery(route())).toBeNull();
  });

  it("目录返回空列表（多半是上游抖动）→ 放行", async () => {
    fetchModels.mockResolvedValue([]);
    expect(await vetoRecovery(route())).toBeNull();
  });

  it("provider 记录查不到 → 放行", async () => {
    mockPrisma.provider.findUnique.mockResolvedValue(null);
    expect(await vetoRecovery(route())).toBeNull();
  });
});
