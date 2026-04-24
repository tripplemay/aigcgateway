/**
 * BL-BILLING-AUDIT-EXT-P1 F-BAX-06 — Tier 1 上游账单 fetcher 接口。
 *
 * "Tier 1" = 上游提供日/月账单 API 的 3 家（Volcengine / OpenRouter /
 * ChatanyWhere）。P1 阶段只实现 adapter，P2 接 reconcile cron 对账。
 *
 * 设计原则：
 *   - 每个 fetcher 完全自洽：读 provider.authConfig 的额外字段、发请求、
 *     解析返回、抛 BillFetchError
 *   - 不做数据库侧行写入；调用方（P2 对账 job）决定如何使用 BillRecord[]
 *   - 不做 engine 层改造：账单 API 与 chat/completions 完全不同，走专用
 *     fetcher 更清晰（决策 B：对账专用 fetch）
 */

/** 统一的账单条目（标准化后，不同 provider 返回 shape 不同但映射到这个接口） */
export interface BillRecord {
  /** 账单日期（UTC，通常按天） */
  date: Date;
  /** provider 侧 model 名（可能与 gateway canonical name 不一致） */
  modelName: string;
  /** 请求次数（API 未返回时为 null） */
  requests: number | null;
  /** 金额（原始货币） */
  amount: number;
  currency: "CNY" | "USD";
  /** provider 原始 JSON（便于对账排障） */
  raw?: Record<string, unknown>;
}

export interface TierOneBillFetcher {
  readonly providerName: string;
  fetchDailyBill(date: Date): Promise<BillRecord[]>;
}

/** fetcher 失败时抛出的错误，包含 provider + 原因 + HTTP 状态码（如有）。 */
export class BillFetchError extends Error {
  constructor(
    public readonly providerName: string,
    public readonly reason: string,
    public readonly httpCode?: number,
  ) {
    super(`[${providerName}] ${reason}${httpCode ? ` (HTTP ${httpCode})` : ""}`);
    this.name = "BillFetchError";
  }
}

/**
 * 从 provider.authConfig 读取扩展账单凭证（可选字段；缺失时 fetcher 应
 * 抛 BillFetchError 且不做尝试）。
 */
export interface BillingAuthConfig {
  apiKey?: string;
  // Volcengine 账单 API 的 AK/SK（和 ark-ef66 model inference key 不同）
  billingAccessKeyId?: string;
  billingSecretAccessKey?: string;
  // OpenRouter 账单 / activity API 需 provisioning key（is_management_key=true）
  provisioningKey?: string;
}

/** YYYY-MM-DD (UTC) 标准化；多个 provider 的 date param 都走这个 format */
export function formatDateYYYYMMDD(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** YYYY-MM (UTC) — Volcengine billing period */
export function formatBillPeriodYYYYMM(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
