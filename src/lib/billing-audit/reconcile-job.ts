/**
 * BL-BILLING-AUDIT-EXT-P2 F-BAP2-02 — 对账主流程。
 *
 * 每日 cron 跑一次：
 *   - Tier 1（volcengine / openrouter / chatanywhere → DB name 是 'openai'）
 *     拉上游 per-model 账单；对每个 model 跑 aggregateGatewayCallLogs
 *     比较 upstream vs gateway，写 bill_reconciliation tier=1 多行。
 *   - Tier 2（deepseek / siliconflow / openrouter credits）
 *     拉余额 snapshot 持久化；与前日 snapshot 求 delta = upstream usage；
 *     与 gateway call_logs 总和比较，写 bill_reconciliation tier=2 一行。
 *   - Tier 3（zhipu / minimax / qwen / xiaomi-mimo / stepfun / moonshot 等）
 *     不上游对账（决策 D1，依赖 gateway 内部 audit）。
 *
 * status 分类（spec § F-BAP2-02 阈值边界，铁律 1.3）：
 *   |delta|<0.5 OR |%|<5         → MATCH
 *   |delta|<5 AND |%|<20         → MINOR_DIFF
 *   else                          → BIG_DIFF
 *
 * 同日重跑：upsert by (providerId, reportDate, modelName)，幂等。
 * 首日 Tier 2 无前日 snapshot：写当天 snapshot 但跳过 delta 对账。
 *
 * 决策 E：仅 SystemLog WARN，不发 email/webhook。
 */
import { prisma } from "@/lib/prisma";
import { writeSystemLog } from "@/lib/system-logger";
import { aggregateGatewayCallLogs } from "./aggregate-gateway";
import { VolcengineBillFetcher } from "./fetchers/volcengine";
import { OpenRouterBillFetcher } from "./fetchers/openrouter";
import { ChatanyWhereBillFetcher } from "./fetchers/chatanywhere";
import { DeepSeekBalanceFetcher } from "./fetchers/balance/deepseek";
import { SiliconFlowBalanceFetcher } from "./fetchers/balance/siliconflow";
import { OpenRouterCreditsFetcher } from "./fetchers/balance/openrouter-credits";
import type { BillingAuthConfig } from "./fetchers/tier1-fetcher";
import type { TierTwoBalanceFetcher, BalanceSnapshot } from "./fetchers/balance/tier2-fetcher";
import type { TierOneBillFetcher, BillRecord } from "./fetchers/tier1-fetcher";

// ============================================================
// 分层 + 状态分类
// ============================================================

export type ProviderTier = 1 | 2 | 3;

const TIER_1_NAMES: ReadonlySet<string> = new Set([
  "volcengine",
  "openrouter", // OpenRouter activity 是 per-day per-model
  "openai", // ChatanyWhere 在 DB 里 name='openai'
]);

const TIER_2_NAMES: ReadonlySet<string> = new Set([
  "deepseek",
  "siliconflow",
  "openrouter-credits", // 仅 reconcile 内部用；DB 中无独立 row（同 openrouter）
]);

/**
 * 分层规则：tier 1 优先于 tier 2（openrouter 同时被两边读取，但作为 provider
 * row 当 tier 1 处理；tier 2 余额单独按 fetchByName 路径调用）。
 */
export function classifyTier(providerName: string): ProviderTier {
  if (TIER_1_NAMES.has(providerName)) return 1;
  if (TIER_2_NAMES.has(providerName)) return 2;
  return 3;
}

/**
 * status 分类阈值（铁律 1.3 显式边界）：
 *   |delta|<0.5  OR  (|%|<5 AND deltaPercent != null)         → MATCH
 *   |delta|<5    AND (|%|<20 OR deltaPercent === null)        → MINOR_DIFF
 *   其他                                                       → BIG_DIFF
 */
export function classifyStatus(
  delta: number,
  deltaPercent: number | null,
): "MATCH" | "MINOR_DIFF" | "BIG_DIFF" {
  const ad = Math.abs(delta);
  const ap = deltaPercent === null ? null : Math.abs(deltaPercent);

  if (ad < 0.5) return "MATCH";
  if (ap !== null && ap < 5) return "MATCH";
  if (ad < 5 && (ap === null || ap < 20)) return "MINOR_DIFF";
  return "BIG_DIFF";
}

function deltaPercent(upstream: number, gateway: number): number | null {
  if (upstream === 0) return null;
  return ((gateway - upstream) / upstream) * 100;
}

// ============================================================
// fetcher 工厂
// ============================================================

interface ProviderRow {
  id: string;
  name: string;
  authConfig: unknown;
}

function tier1FetcherFor(p: ProviderRow): TierOneBillFetcher | null {
  const auth = (p.authConfig ?? {}) as BillingAuthConfig;
  switch (p.name) {
    case "volcengine":
      return new VolcengineBillFetcher(auth);
    case "openrouter":
      return new OpenRouterBillFetcher(auth);
    case "openai": // ChatanyWhere
      return new ChatanyWhereBillFetcher(auth);
    default:
      return null;
  }
}

function tier2FetcherFor(p: ProviderRow): TierTwoBalanceFetcher | null {
  const auth = (p.authConfig ?? {}) as { apiKey?: string };
  switch (p.name) {
    case "deepseek":
      return new DeepSeekBalanceFetcher(auth);
    case "siliconflow":
      return new SiliconFlowBalanceFetcher(auth);
    case "openrouter":
      // OR 双 tier：余额单独跑（tier=2），账单仍走 tier 1 路径
      return new OpenRouterCreditsFetcher(auth);
    default:
      return null;
  }
}

// ============================================================
// 入库 helpers
// ============================================================

interface ReconUpsertParams {
  providerId: string;
  reportDate: Date;
  tier: ProviderTier;
  modelName: string | null;
  upstreamAmount: number;
  gatewayAmount: number;
  details: Record<string, unknown>;
}

async function upsertReconciliation(params: ReconUpsertParams): Promise<void> {
  const delta = params.gatewayAmount - params.upstreamAmount;
  const dp = deltaPercent(params.upstreamAmount, params.gatewayAmount);
  const status = classifyStatus(delta, dp);

  // Prisma 不能直接 upsert 含 nullable 字段的 compound unique key（modelName
  // 在 tier=2 是 null）。手动 findFirst + 分支处理，幂等语义不变。
  const existing = await prisma.billReconciliation.findFirst({
    where: {
      providerId: params.providerId,
      reportDate: params.reportDate,
      modelName: params.modelName,
    },
    select: { id: true },
  });

  const data = {
    upstreamAmount: params.upstreamAmount,
    gatewayAmount: params.gatewayAmount,
    delta,
    deltaPercent: dp ?? undefined,
    status,
    details: params.details as object,
    computedAt: new Date(),
  };

  if (existing) {
    await prisma.billReconciliation.update({
      where: { id: existing.id },
      data,
    });
  } else {
    await prisma.billReconciliation.create({
      data: {
        providerId: params.providerId,
        reportDate: params.reportDate,
        tier: params.tier,
        modelName: params.modelName,
        ...data,
      },
    });
  }
}

// ============================================================
// Tier 1 / Tier 2 path
// ============================================================

async function reconcileTier1(
  provider: ProviderRow,
  reportDate: Date,
): Promise<{ rows: number; bigDiffs: number }> {
  const fetcher = tier1FetcherFor(provider);
  if (!fetcher) return { rows: 0, bigDiffs: 0 };

  let bills: BillRecord[];
  try {
    bills = await fetcher.fetchDailyBill(reportDate);
  } catch (err) {
    console.error(`[reconcile] tier1 fetch ${provider.name} failed:`, err);
    return { rows: 0, bigDiffs: 0 };
  }

  let bigDiffs = 0;
  // tier=1 至少写 1 行 placeholder（即使上游返回 empty），让面板知道"今天对过账"。
  if (bills.length === 0) {
    const gatewaySum = await aggregateGatewayCallLogs(provider.id, null, reportDate);
    await upsertReconciliation({
      providerId: provider.id,
      reportDate,
      tier: 1,
      modelName: null,
      upstreamAmount: 0,
      gatewayAmount: gatewaySum,
      details: { note: "upstream returned empty bill list" },
    });
    return { rows: 1, bigDiffs: gatewaySum > 5 ? 1 : 0 };
  }

  for (const bill of bills) {
    const gatewaySum = await aggregateGatewayCallLogs(provider.id, bill.modelName, reportDate);
    const delta = gatewaySum - bill.amount;
    const dp = deltaPercent(bill.amount, gatewaySum);
    const status = classifyStatus(delta, dp);
    if (status === "BIG_DIFF") bigDiffs += 1;

    await upsertReconciliation({
      providerId: provider.id,
      reportDate,
      tier: 1,
      modelName: bill.modelName,
      upstreamAmount: bill.amount,
      gatewayAmount: gatewaySum,
      details: {
        currency: bill.currency,
        upstreamRequests: bill.requests,
        raw: bill.raw ?? null,
      },
    });
  }

  return { rows: bills.length, bigDiffs };
}

async function reconcileTier2(
  provider: ProviderRow,
  reportDate: Date,
): Promise<{ rows: number; bigDiffs: number }> {
  const fetcher = tier2FetcherFor(provider);
  if (!fetcher) return { rows: 0, bigDiffs: 0 };

  let snaps: BalanceSnapshot[];
  try {
    snaps = await fetcher.fetchBalanceSnapshot();
  } catch (err) {
    console.error(`[reconcile] tier2 balance fetch ${provider.name} failed:`, err);
    return { rows: 0, bigDiffs: 0 };
  }

  // 持久化所有 snapshot（DeepSeek 多币种）
  for (const snap of snaps) {
    await prisma.balanceSnapshot.create({
      data: {
        providerId: provider.id,
        snapshotAt: snap.snapshotAt,
        currency: snap.currency,
        balance: snap.balance,
        totalUsage: snap.totalUsage,
        raw: snap.raw as object,
      },
    });
  }

  // 取每个 currency 的"前日 snapshot"做 delta；首日没有 → 跳过 delta
  let rows = 0;
  let bigDiffs = 0;
  for (const snap of snaps) {
    const prev = await prisma.balanceSnapshot.findFirst({
      where: {
        providerId: provider.id,
        currency: snap.currency,
        snapshotAt: { lt: snap.snapshotAt },
      },
      orderBy: { snapshotAt: "desc" },
    });
    if (!prev) {
      // 首日不写 reconciliation 行；只有 snapshot
      continue;
    }
    const upstreamUsage = Number(prev.balance) - snap.balance; // 余额下降 = 消费
    const gatewaySum = await aggregateGatewayCallLogs(provider.id, null, reportDate);
    const dp = deltaPercent(upstreamUsage, gatewaySum);
    const status = classifyStatus(gatewaySum - upstreamUsage, dp);
    if (status === "BIG_DIFF") bigDiffs += 1;

    await upsertReconciliation({
      providerId: provider.id,
      reportDate,
      tier: 2,
      modelName: null,
      upstreamAmount: upstreamUsage,
      gatewayAmount: gatewaySum,
      details: {
        currency: snap.currency,
        prevSnapshotAt: prev.snapshotAt,
        prevBalance: Number(prev.balance),
        currBalance: snap.balance,
      },
    });
    rows += 1;
  }
  return { rows, bigDiffs };
}

// ============================================================
// 主入口
// ============================================================

export interface ReconciliationResult {
  reportDate: Date;
  providersInspected: number;
  rowsWritten: number;
  bigDiffs: number;
}

export async function runReconciliation(
  reportDate: Date,
  opts?: { providerId?: string },
): Promise<ReconciliationResult> {
  const providers = await prisma.provider.findMany({
    where: {
      status: "ACTIVE",
      ...(opts?.providerId ? { id: opts.providerId } : {}),
    },
    select: { id: true, name: true, authConfig: true },
  });

  let rowsWritten = 0;
  let bigDiffs = 0;
  for (const p of providers) {
    const tier = classifyTier(p.name);
    if (tier === 3) continue;

    if (tier === 1) {
      const { rows, bigDiffs: bd } = await reconcileTier1(p, reportDate);
      rowsWritten += rows;
      bigDiffs += bd;
      // openrouter 同时跑 tier 2 余额（双 tier）
      if (p.name === "openrouter") {
        const t2 = await reconcileTier2(p, reportDate);
        rowsWritten += t2.rows;
        bigDiffs += t2.bigDiffs;
      }
    } else if (tier === 2) {
      const { rows, bigDiffs: bd } = await reconcileTier2(p, reportDate);
      rowsWritten += rows;
      bigDiffs += bd;
    }
  }

  // SystemLog（决策 E：不发 email/webhook）
  const level: "INFO" | "WARN" = bigDiffs > 0 ? "WARN" : "INFO";
  await writeSystemLog(
    "BILLING_AUDIT",
    level,
    `Reconciliation ${reportDate.toISOString().slice(0, 10)} — ` +
      `providers=${providers.length} rows=${rowsWritten} bigDiffs=${bigDiffs}`,
    {
      reportDate: reportDate.toISOString(),
      providersInspected: providers.length,
      rowsWritten,
      bigDiffs,
    },
  ).catch((err) => console.error("[reconcile] writeSystemLog failed:", err));

  return {
    reportDate,
    providersInspected: providers.length,
    rowsWritten,
    bigDiffs,
  };
}
