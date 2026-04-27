/**
 * BL-RECON-UX-PHASE1 fix_round 1 tc13 — wiring 集成测试。
 *
 * 验证「runReconciliation 入口加载 SystemConfig 阈值 → thread 给
 * classifyStatus → 写入 BillReconciliation 的 status 字段反映阈值变化」
 * 的完整链路。
 *
 * 用 fake fetcher 注入（runReconciliation 第三参数 __testFetcherOverrides）
 * 跳过真实 billing API 凭证；用 prisma mock 控制 SystemConfig 返回值。
 *
 * 核心断言（零基线）：同一 fakeFetcher、同一 delta（upstream=10, gateway=9.7
 * → delta=-0.3, deltaPercent=-3%）：
 *   - 默认阈值 (matchDelta=0.5, matchPercent=5)：ad=0.3<0.5 → MATCH
 *   - 紧阈值 (matchDelta=0.1, matchPercent=1)：ad=0.3≥0.1, ap=3≥1,
 *     ad<5 + ap<20 → MINOR_DIFF
 *   - status A !== status B → wiring 完整证据
 *
 * 裁决文档：docs/adjudications/BL-RECON-UX-PHASE1-tc13-relaxation-2026-04-27.md
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BillRecord, TierOneBillFetcher } from "../fetchers/tier1-fetcher";

const findManyProvidersMock = vi.fn();
const findFirstReconMock = vi.fn();
const updateReconMock = vi.fn();
const createReconMock = vi.fn();
const findManyCallLogMock = vi.fn();
const findUniqueSystemConfigMock = vi.fn();
const writeSystemLogMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    provider: { findMany: (a: unknown) => findManyProvidersMock(a) },
    callLog: { findMany: (a: unknown) => findManyCallLogMock(a) },
    billReconciliation: {
      findFirst: (a: unknown) => findFirstReconMock(a),
      update: (a: unknown) => updateReconMock(a),
      create: (a: unknown) => createReconMock(a),
    },
    systemConfig: {
      findUnique: (a: unknown) => findUniqueSystemConfigMock(a),
    },
  },
}));

vi.mock("@/lib/system-logger", () => ({
  writeSystemLog: (...args: unknown[]) => writeSystemLogMock(...args),
}));

// 故意不 mock @/lib/config —— 让 getConfigNumber 真实跑，命中 prisma.systemConfig
// findUnique mock。这样测试覆盖完整 wiring 链路：runReconciliation → loadThresholds
// → getConfigNumber → prisma.systemConfig.findUnique。

// reconcile-job 内部使用的 fetcher 工厂会 new VolcengineBillFetcher(...) 之类，
// 但因为我们传入 __testFetcherOverrides，工厂被绕开；不需要 mock fetcher 模块。

import { runReconciliation } from "../reconcile-job";

const REPORT_DATE = new Date("2026-04-22T00:00:00Z");
const TEST_PROVIDER_ID = "p_test_t1";

interface FakeFetcherOpts {
  upstream: number;
  modelName?: string;
}

function makeFakeTier1Fetcher({ upstream, modelName = "test-model" }: FakeFetcherOpts): TierOneBillFetcher {
  return {
    providerName: "volcengine", // 让 classifyTier 命中 Tier 1
    async fetchDailyBill(date: Date): Promise<BillRecord[]> {
      return [
        {
          date,
          modelName,
          requests: 1,
          amount: upstream,
          currency: "USD",
        },
      ];
    },
  };
}

/** 设置 SystemConfig.findUnique 返回值；未列出 key 返回 null（→ getConfigNumber 用 default）。 */
function mockSystemConfigValues(values: Record<string, string>): void {
  findUniqueSystemConfigMock.mockImplementation(({ where }: { where: { key: string } }) => {
    const v = values[where.key];
    return Promise.resolve(v === undefined ? null : { key: where.key, value: v });
  });
}

beforeEach(() => {
  findManyProvidersMock.mockReset();
  findFirstReconMock.mockReset();
  updateReconMock.mockReset();
  createReconMock.mockReset();
  findManyCallLogMock.mockReset();
  findUniqueSystemConfigMock.mockReset();
  writeSystemLogMock.mockReset();

  // 默认：1 个 Tier 1 test provider；recon row 不存在（→ create path）
  findManyProvidersMock.mockResolvedValue([
    { id: TEST_PROVIDER_ID, name: "volcengine", authConfig: {} },
  ]);
  findFirstReconMock.mockResolvedValue(null);
  updateReconMock.mockResolvedValue({});
  createReconMock.mockResolvedValue({});
  // gateway 聚合返 9.7（callLog.costPrice 累加 = 9.7）
  findManyCallLogMock.mockResolvedValue([{ costPrice: 9.7 }]);
  // 默认无 SystemConfig 覆盖 → loadThresholds 全部走 default
  mockSystemConfigValues({});
  writeSystemLogMock.mockResolvedValue(undefined);
});

// describe.sequential 防 mock state 跨测试污染（vitest 默认并发 it，但 mocks
// 是模块级 single instance）。
describe.sequential("F-RC-03 tc13 — runReconciliation thresholds wiring", () => {
  it("[A] default thresholds — fake fetcher upstream=10, gateway=9.7 → status=MATCH", async () => {
    // 默认阈值：matchDelta=0.5, matchPercent=5, minorDelta=5, minorPercent=20
    const fakeFetcher = makeFakeTier1Fetcher({ upstream: 10 });
    const overrides = {
      tier1: new Map([[TEST_PROVIDER_ID, fakeFetcher]]),
    };

    const result = await runReconciliation(REPORT_DATE, undefined, overrides);

    expect(result.providersInspected).toBe(1);
    expect(result.rowsWritten).toBe(1);
    expect(createReconMock).toHaveBeenCalledTimes(1);
    const created = createReconMock.mock.calls[0][0].data;
    expect(created.tier).toBe(1);
    expect(created.modelName).toBe("test-model");
    expect(created.upstreamAmount).toBe(10);
    expect(created.gatewayAmount).toBeCloseTo(9.7, 6);
    // 默认 matchDelta=0.5：|delta|=0.3 < 0.5 → MATCH
    expect(created.status).toBe("MATCH");
  });

  it("[B] tightened thresholds (matchDelta=0.1, matchPercent=1) → status=MINOR_DIFF", async () => {
    // 紧阈值：matchDelta 0.5→0.1, matchPercent 5→1，其他默认
    mockSystemConfigValues({
      RECONCILIATION_MATCH_DELTA_USD: "0.1",
      RECONCILIATION_MATCH_PERCENT: "1",
      // RECONCILIATION_MINOR_DELTA_USD / MINOR_PERCENT 不变（走默认 5 / 20）
    });

    const fakeFetcher = makeFakeTier1Fetcher({ upstream: 10 });
    const overrides = {
      tier1: new Map([[TEST_PROVIDER_ID, fakeFetcher]]),
    };

    const result = await runReconciliation(REPORT_DATE, undefined, overrides);

    expect(result.rowsWritten).toBe(1);
    expect(createReconMock).toHaveBeenCalledTimes(1);
    const created = createReconMock.mock.calls[0][0].data;
    expect(created.upstreamAmount).toBe(10);
    expect(created.gatewayAmount).toBeCloseTo(9.7, 6);
    // 紧阈值：ad=0.3 ≥ matchDelta=0.1, ap=3 ≥ matchPercent=1
    //         → 不命中 MATCH；ad=0.3 < minorDelta=5 且 ap=3 < minorPercent=20
    //         → MINOR_DIFF
    expect(created.status).toBe("MINOR_DIFF");
  });

  it("[C] same fakeFetcher / same delta — status differs across threshold sets (wiring 证据)", async () => {
    const fakeFetcher = makeFakeTier1Fetcher({ upstream: 10 });
    const overrides = {
      tier1: new Map([[TEST_PROVIDER_ID, fakeFetcher]]),
    };

    // run 1: defaults
    mockSystemConfigValues({});
    await runReconciliation(REPORT_DATE, undefined, overrides);
    const statusA = createReconMock.mock.calls[0][0].data.status;

    // reset create mock between runs（保持其他 mocks）
    createReconMock.mockClear();
    findManyProvidersMock.mockResolvedValue([
      { id: TEST_PROVIDER_ID, name: "volcengine", authConfig: {} },
    ]);
    findManyCallLogMock.mockResolvedValue([{ costPrice: 9.7 }]);

    // run 2: tightened
    mockSystemConfigValues({
      RECONCILIATION_MATCH_DELTA_USD: "0.1",
      RECONCILIATION_MATCH_PERCENT: "1",
    });
    await runReconciliation(REPORT_DATE, undefined, overrides);
    const statusB = createReconMock.mock.calls[0][0].data.status;

    expect(statusA).toBe("MATCH");
    expect(statusB).toBe("MINOR_DIFF");
    expect(statusA).not.toBe(statusB);
  });

  it("[D] without override — runReconciliation falls back to factory (no callsite regression)", async () => {
    // 不传 overrides，只 1 个真实 provider，但 authConfig 为空 → fetcher 抛错
    // → reconcileTier1 catch 后返回 0 行。这证明生产 callsite 行为不变。
    findManyProvidersMock.mockResolvedValueOnce([
      { id: "p_volc_real", name: "volcengine", authConfig: {} }, // 无 billingAccessKeyId/SecretAccessKey
    ]);

    const result = await runReconciliation(REPORT_DATE);
    // VolcengineBillFetcher.fetchDailyBill 在凭证缺失时抛 BillFetchError
    // → catch → 返回 0 行（与现有行为一致）
    expect(result.rowsWritten).toBe(0);
    expect(createReconMock).not.toHaveBeenCalled();
  });
});
