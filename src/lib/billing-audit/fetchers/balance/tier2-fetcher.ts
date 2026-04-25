/**
 * BL-BILLING-AUDIT-EXT-P2 F-BAP2-01 — Tier 2 余额快照接口。
 *
 * Tier 2 = 上游不返回 per-model 账单但返回当前余额（DeepSeek / SiliconFlow /
 * OpenRouter credits）。每日 cron 拉一次 snapshot，前后日 delta = 上游消费。
 *
 * 设计：fetcher 只负责拉 + 解析 → 标准化 BalanceSnapshot；持久化与 delta
 * 计算放在 reconcile-job 里，保持单一职责。
 */

/** 一次余额查询的标准化结果（持久化前） */
export interface BalanceSnapshot {
  /** 源 provider 名（标准化字段，与 DB.providerId 由调用方解析） */
  providerName: string;
  /** 拉取时间（默认 now） */
  snapshotAt: Date;
  currency: "CNY" | "USD";
  /** 当前余额（可能为负，例如 SiliconFlow 欠费） */
  balance: number;
  /** lifetime 累计消费（OpenRouter /credits 才有） */
  totalUsage?: number;
  /** 原始 JSON，便于排障 */
  raw: Record<string, unknown>;
}

export interface TierTwoBalanceFetcher {
  readonly providerName: string;
  /** 一次调用返回 1 个或多个 snapshot（DeepSeek 多币种） */
  fetchBalanceSnapshot(): Promise<BalanceSnapshot[]>;
}

/** 拉取失败时抛出的错误，包含 provider + HTTP 状态码（如有） */
export class BalanceFetchError extends Error {
  constructor(
    public readonly providerName: string,
    public readonly reason: string,
    public readonly httpCode?: number,
  ) {
    super(`[${providerName}] ${reason}${httpCode ? ` (HTTP ${httpCode})` : ""}`);
    this.name = "BalanceFetchError";
  }
}

/** 5s 超时 wrapper（Tier 1 fetcher 没用，本批次为新增） */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = 10_000, ...rest } = init;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...rest, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}
