/**
 * BL-BILLING-AUDIT-EXT-P1 F-BAX-06 — ChatanyWhere 账单 fetcher.
 *
 * POST https://api.chatanywhere.org/v1/query/day_usage_details
 * body: {"date": "YYYY-MM-DD"}
 * Auth: Bearer <apiKey>
 *
 * 关键细节：必须带 `User-Agent: Mozilla/5.0`，否则 Cloudflare 1010
 * 规则直接拦截。此限制来自 2026-04-23 生产实测。
 *
 * 已知局限：只返回当前 key 的 usage，key 轮换后老数据丢失。P2 对账 job
 * 会在 key 轮换前 snapshot 老 key 的全部历史。
 */
import {
  type BillRecord,
  type BillingAuthConfig,
  type TierOneBillFetcher,
  BillFetchError,
  formatDateYYYYMMDD,
} from "./tier1-fetcher";

const ENDPOINT = "https://api.chatanywhere.org/v1/query/day_usage_details";
const UA = "Mozilla/5.0 (compatible; AIGC-Gateway-Audit/1.0)";

interface UsageDetailItem {
  model?: string;
  tokens?: number;
  amount?: number;
  count?: number;
  [key: string]: unknown;
}

interface UsageDetailResponse {
  data?: UsageDetailItem[];
  details?: UsageDetailItem[]; // 不同版本字段名差异兼容
}

export class ChatanyWhereBillFetcher implements TierOneBillFetcher {
  readonly providerName = "chatanywhere";

  constructor(private readonly auth: BillingAuthConfig) {}

  async fetchDailyBill(date: Date): Promise<BillRecord[]> {
    const key = this.auth.apiKey;
    if (!key) {
      throw new BillFetchError(this.providerName, "authConfig.apiKey not configured");
    }

    const dateStr = formatDateYYYYMMDD(date);
    const body = JSON.stringify({ date: dateStr });

    let response: Response;
    try {
      response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
          "User-Agent": UA, // 必须 — Cloudflare 1010 bot 规则绕过
        },
        body,
      });
    } catch (err) {
      throw new BillFetchError(
        this.providerName,
        `network error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const text = await response.text();
    if (!response.ok) {
      throw new BillFetchError(
        this.providerName,
        `HTTP ${response.status}: ${text.slice(0, 200)}`,
        response.status,
      );
    }

    let parsed: UsageDetailResponse;
    try {
      parsed = JSON.parse(text);
    } catch {
      // 空响应或非 JSON（可能当日无 usage）— 返回空数组而不是抛错
      return [];
    }

    const items = parsed.data ?? parsed.details ?? [];
    return items.map((item) => normalizeItem(item, date));
  }
}

function normalizeItem(item: UsageDetailItem, date: Date): BillRecord {
  return {
    date,
    modelName: typeof item.model === "string" ? item.model : "unknown",
    requests: typeof item.count === "number" ? item.count : null,
    amount: typeof item.amount === "number" ? item.amount : 0,
    currency: "USD",
    raw: item as Record<string, unknown>,
  };
}

// Exported for tests
export const __testing = { ENDPOINT, UA, normalizeItem };
