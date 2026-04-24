/**
 * BL-BILLING-AUDIT-EXT-P1 F-BAX-06 — OpenRouter 账单 fetcher.
 *
 * GET https://openrouter.ai/api/v1/activity?date=YYYY-MM-DD
 * Auth: Bearer <provisioningKey>（is_management_key=true，不是 inference key）
 *
 * 特性：provisioning key 可以拉任意子 key 的 activity（按日分组），是
 * 对账的首选入口（inference key 只能看到当前 key 的数据）。
 */
import {
  type BillRecord,
  type BillingAuthConfig,
  type TierOneBillFetcher,
  BillFetchError,
  formatDateYYYYMMDD,
} from "./tier1-fetcher";

const BASE = "https://openrouter.ai/api/v1";

interface ActivityItem {
  date?: string;
  model?: string;
  model_permaslug?: string;
  provider_name?: string;
  usage?: number; // total spend USD
  requests?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  [key: string]: unknown;
}

interface ActivityResponse {
  data?: ActivityItem[];
}

export class OpenRouterBillFetcher implements TierOneBillFetcher {
  readonly providerName = "openrouter";

  constructor(private readonly auth: BillingAuthConfig) {}

  async fetchDailyBill(date: Date): Promise<BillRecord[]> {
    const key = this.auth.provisioningKey;
    if (!key) {
      throw new BillFetchError(
        this.providerName,
        "authConfig.provisioningKey not configured (needs is_management_key=true)",
      );
    }

    const dateStr = formatDateYYYYMMDD(date);
    const url = `${BASE}/activity?date=${dateStr}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${key}`,
        },
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

    let parsed: ActivityResponse;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new BillFetchError(this.providerName, "response is not JSON");
    }

    const items = parsed.data ?? [];
    return items.map((item) => normalizeItem(item, date));
  }
}

function normalizeItem(item: ActivityItem, requestedDate: Date): BillRecord {
  const date = item.date ? new Date(`${item.date}T00:00:00Z`) : new Date(requestedDate);
  return {
    date,
    modelName: item.model_permaslug ?? item.model ?? "unknown",
    requests: typeof item.requests === "number" ? item.requests : null,
    amount: typeof item.usage === "number" ? item.usage : 0,
    currency: "USD",
    raw: item as Record<string, unknown>,
  };
}

// Exported for tests
export const __testing = { normalizeItem };
