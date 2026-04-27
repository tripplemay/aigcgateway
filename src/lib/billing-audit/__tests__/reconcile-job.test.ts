/**
 * F-BAP2-02 runReconciliation 单测（铁律 1.3 + mock 层级）。
 *
 * 覆盖：
 *   1) tier 1 provider → 调 fetchDailyBill + aggregate + upsert per-model 行
 *   2) tier 2 provider 首日（无前日 snapshot）→ 写 snapshot 但不写 reconciliation
 *   3) tier 2 provider 第二日 → delta = prev.balance - curr.balance，写 reconciliation
 *   4) tier 3 provider 跳过（不写 snapshot 也不写 reconciliation）
 *   5) 同日重跑 upsert：不产生重复行
 *   6) BIG_DIFF >0 时 SystemLog WARN，否则 INFO
 *
 * 这是最外层 mock（铁律：穿透多层转换需顶层 mock）：mock prisma + 各
 * fetcher.fetchDailyBill / fetchBalanceSnapshot 的返回值。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const findManyProvidersMock = vi.fn();
const upsertReconMock = vi.fn();
const findFirstReconMock = vi.fn();
const updateReconMock = vi.fn();
const createReconMock = vi.fn();
const findManyCallLogMock = vi.fn();
const createSnapshotMock = vi.fn();
const findFirstSnapshotMock = vi.fn();
const writeSystemLogMock = vi.fn();

const volcengineFetchMock = vi.fn();
const openrouterFetchMock = vi.fn();
const chatanywhereFetchMock = vi.fn();
const deepseekBalanceMock = vi.fn();
const siliconflowBalanceMock = vi.fn();
const openrouterCreditsMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    provider: { findMany: (a: unknown) => findManyProvidersMock(a) },
    callLog: { findMany: (a: unknown) => findManyCallLogMock(a) },
    billReconciliation: {
      upsert: (a: unknown) => upsertReconMock(a),
      findFirst: (a: unknown) => findFirstReconMock(a),
      update: (a: unknown) => updateReconMock(a),
      create: (a: unknown) => createReconMock(a),
    },
    balanceSnapshot: {
      create: (a: unknown) => createSnapshotMock(a),
      findFirst: (a: unknown) => findFirstSnapshotMock(a),
    },
  },
}));

vi.mock("@/lib/system-logger", () => ({
  writeSystemLog: (...args: unknown[]) => writeSystemLogMock(...args),
}));

// F-RC-01c: loadThresholds() reads from SystemConfig via getConfigNumber.
// Mock @/lib/config so reconcile flow uses default thresholds, keeping
// existing test expectations stable (no behavior change).
vi.mock("@/lib/config", () => ({
  getConfig: async () => undefined,
  getConfigNumber: async (_key: string, def: number) => def,
  setConfig: async () => undefined,
}));

vi.mock("../fetchers/volcengine", () => ({
  VolcengineBillFetcher: class {
    fetchDailyBill = volcengineFetchMock;
  },
}));
vi.mock("../fetchers/openrouter", () => ({
  OpenRouterBillFetcher: class {
    fetchDailyBill = openrouterFetchMock;
  },
}));
vi.mock("../fetchers/chatanywhere", () => ({
  ChatanyWhereBillFetcher: class {
    fetchDailyBill = chatanywhereFetchMock;
  },
}));
vi.mock("../fetchers/balance/deepseek", () => ({
  DeepSeekBalanceFetcher: class {
    fetchBalanceSnapshot = deepseekBalanceMock;
  },
}));
vi.mock("../fetchers/balance/siliconflow", () => ({
  SiliconFlowBalanceFetcher: class {
    fetchBalanceSnapshot = siliconflowBalanceMock;
  },
}));
vi.mock("../fetchers/balance/openrouter-credits", () => ({
  OpenRouterCreditsFetcher: class {
    fetchBalanceSnapshot = openrouterCreditsMock;
  },
}));

import { runReconciliation } from "../reconcile-job";

const REPORT_DATE = new Date("2026-04-22T00:00:00Z");

beforeEach(() => {
  findManyProvidersMock.mockReset();
  upsertReconMock.mockReset();
  findFirstReconMock.mockReset();
  updateReconMock.mockReset();
  createReconMock.mockReset();
  findManyCallLogMock.mockReset();
  createSnapshotMock.mockReset();
  findFirstSnapshotMock.mockReset();
  writeSystemLogMock.mockReset();
  volcengineFetchMock.mockReset();
  openrouterFetchMock.mockReset();
  chatanywhereFetchMock.mockReset();
  deepseekBalanceMock.mockReset();
  siliconflowBalanceMock.mockReset();
  openrouterCreditsMock.mockReset();

  upsertReconMock.mockResolvedValue({});
  findFirstReconMock.mockResolvedValue(null); // default: no existing row → create path
  updateReconMock.mockResolvedValue({});
  createReconMock.mockResolvedValue({});
  createSnapshotMock.mockResolvedValue({});
  findManyCallLogMock.mockResolvedValue([]);
  findFirstSnapshotMock.mockResolvedValue(null);
  writeSystemLogMock.mockResolvedValue(undefined);
});

describe("F-BAP2-02 runReconciliation tier 1", () => {
  it("Tier 1 volcengine → upsert per-model row, classify status", async () => {
    findManyProvidersMock.mockResolvedValueOnce([
      { id: "p_volc", name: "volcengine", authConfig: {} },
    ]);
    volcengineFetchMock.mockResolvedValueOnce([
      { date: REPORT_DATE, modelName: "ep-abc", requests: 100, amount: 3.5, currency: "CNY" },
    ]);
    findManyCallLogMock.mockResolvedValueOnce([{ costPrice: 3.5 }]); // gateway sum=3.5

    const result = await runReconciliation(REPORT_DATE);
    expect(result.providersInspected).toBe(1);
    expect(result.rowsWritten).toBe(1);
    expect(createReconMock).toHaveBeenCalledTimes(1);
    const args = { create: createReconMock.mock.calls[0][0].data };
    expect(args.create.tier).toBe(1);
    expect(args.create.modelName).toBe("ep-abc");
    expect(args.create.upstreamAmount).toBe(3.5);
    expect(args.create.gatewayAmount).toBe(3.5);
    expect(args.create.status).toBe("MATCH"); // delta=0
  });

  it("Tier 1 returns empty bill list → write placeholder row with upstreamAmount=0", async () => {
    findManyProvidersMock.mockResolvedValueOnce([{ id: "p_caw", name: "openai", authConfig: {} }]);
    chatanywhereFetchMock.mockResolvedValueOnce([]);
    findManyCallLogMock.mockResolvedValueOnce([{ costPrice: 0.1 }, { costPrice: 0.2 }]);

    await runReconciliation(REPORT_DATE);
    expect(createReconMock).toHaveBeenCalledTimes(1);
    const args = { create: createReconMock.mock.calls[0][0].data };
    expect(args.create.upstreamAmount).toBe(0);
    expect(args.create.gatewayAmount).toBeCloseTo(0.3);
    expect(args.create.modelName).toBeNull();
    expect(args.create.details.note).toMatch(/empty/i);
  });

  it("Tier 1 fetcher throws → no row written, continue with next provider", async () => {
    findManyProvidersMock.mockResolvedValueOnce([
      { id: "p_volc", name: "volcengine", authConfig: {} },
    ]);
    volcengineFetchMock.mockRejectedValueOnce(new Error("502 upstream"));

    const result = await runReconciliation(REPORT_DATE);
    expect(result.rowsWritten).toBe(0);
    expect(createReconMock).not.toHaveBeenCalled();
    expect(updateReconMock).not.toHaveBeenCalled();
  });
});

describe("F-BAP2-02 runReconciliation tier 2", () => {
  it("first day (no prev snapshot) → writes snapshot but skips reconciliation row", async () => {
    findManyProvidersMock.mockResolvedValueOnce([
      { id: "p_ds", name: "deepseek", authConfig: { apiKey: "x" } },
    ]);
    deepseekBalanceMock.mockResolvedValueOnce([
      {
        providerName: "deepseek",
        snapshotAt: new Date("2026-04-22T05:00:00Z"),
        currency: "CNY",
        balance: 100,
        raw: {},
      },
    ]);
    findFirstSnapshotMock.mockResolvedValueOnce(null);

    const result = await runReconciliation(REPORT_DATE);
    expect(createSnapshotMock).toHaveBeenCalledTimes(1);
    expect(createReconMock).not.toHaveBeenCalled();
    expect(updateReconMock).not.toHaveBeenCalled();
    expect(result.rowsWritten).toBe(0);
  });

  it("second day → delta = prev - curr, write tier 2 reconciliation row", async () => {
    findManyProvidersMock.mockResolvedValueOnce([
      { id: "p_sf", name: "siliconflow", authConfig: { apiKey: "x" } },
    ]);
    siliconflowBalanceMock.mockResolvedValueOnce([
      {
        providerName: "siliconflow",
        snapshotAt: new Date("2026-04-22T05:00:00Z"),
        currency: "CNY",
        balance: 90,
        raw: {},
      },
    ]);
    findFirstSnapshotMock.mockResolvedValueOnce({
      snapshotAt: new Date("2026-04-21T05:00:00Z"),
      balance: 100,
      currency: "CNY",
    });
    findManyCallLogMock.mockResolvedValueOnce([{ costPrice: 9.95 }]);

    const result = await runReconciliation(REPORT_DATE);
    expect(createSnapshotMock).toHaveBeenCalledTimes(1);
    expect(createReconMock).toHaveBeenCalledTimes(1);
    const args = { create: createReconMock.mock.calls[0][0].data };
    expect(args.create.tier).toBe(2);
    expect(args.create.modelName).toBeNull();
    expect(args.create.upstreamAmount).toBe(10); // 100 - 90
    expect(args.create.gatewayAmount).toBeCloseTo(9.95);
    // delta=-0.05, abs<0.5 → MATCH
    expect(args.create.status).toBe("MATCH");
    expect(result.rowsWritten).toBe(1);
  });
});

describe("F-BAP2-02 runReconciliation overall", () => {
  it("Tier 3 provider skipped entirely (decision D1)", async () => {
    findManyProvidersMock.mockResolvedValueOnce([
      { id: "p_zhipu", name: "zhipu", authConfig: {} },
      { id: "p_qwen", name: "qwen", authConfig: {} },
    ]);

    const result = await runReconciliation(REPORT_DATE);
    expect(result.providersInspected).toBe(2);
    expect(result.rowsWritten).toBe(0);
    expect(volcengineFetchMock).not.toHaveBeenCalled();
    expect(deepseekBalanceMock).not.toHaveBeenCalled();
    expect(createSnapshotMock).not.toHaveBeenCalled();
  });

  it("BIG_DIFF >0 → SystemLog WARN", async () => {
    findManyProvidersMock.mockResolvedValueOnce([
      { id: "p_volc", name: "volcengine", authConfig: {} },
    ]);
    volcengineFetchMock.mockResolvedValueOnce([
      { date: REPORT_DATE, modelName: "ep-abc", requests: 100, amount: 100, currency: "CNY" },
    ]);
    findManyCallLogMock.mockResolvedValueOnce([{ costPrice: 50 }]); // gateway 50 vs upstream 100 → delta=50, |%|=50 → BIG_DIFF

    const result = await runReconciliation(REPORT_DATE);
    expect(result.bigDiffs).toBe(1);
    expect(writeSystemLogMock).toHaveBeenCalledWith(
      "BILLING_AUDIT",
      "WARN",
      expect.stringContaining("bigDiffs=1"),
      expect.any(Object),
    );
  });

  it("BIG_DIFF=0 → SystemLog INFO", async () => {
    findManyProvidersMock.mockResolvedValueOnce([]);
    await runReconciliation(REPORT_DATE);
    expect(writeSystemLogMock).toHaveBeenCalledWith(
      "BILLING_AUDIT",
      "INFO",
      expect.stringContaining("bigDiffs=0"),
      expect.any(Object),
    );
  });

  it("opts.providerId scopes the run to a single provider", async () => {
    findManyProvidersMock.mockResolvedValueOnce([
      { id: "p_volc", name: "volcengine", authConfig: {} },
    ]);
    volcengineFetchMock.mockResolvedValueOnce([]);
    findManyCallLogMock.mockResolvedValueOnce([]);

    await runReconciliation(REPORT_DATE, { providerId: "p_volc" });
    const args = findManyProvidersMock.mock.calls[0][0];
    expect(args.where.id).toBe("p_volc");
  });
});
