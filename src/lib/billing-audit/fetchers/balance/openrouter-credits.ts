/**
 * BL-BILLING-AUDIT-EXT-P2 F-BAP2-01 — OpenRouter credits fetcher.
 *
 * GET https://openrouter.ai/api/v1/credits
 * Auth: Bearer <apiKey>（普通 API key 即可，不需 provisioning key）
 *
 * 返回 { data: { total_credits: number, total_usage: number } } —
 * 单一 USD 货币，balance = total_credits - total_usage。totalUsage 一并保存
 * 用于趋势图。
 *
 * 与 P1 OpenRouterBillFetcher（/api/v1/activity，需 provisioning key）相互
 * 独立 —— 一个查 per-day per-model 账单，一个查 lifetime credits 余额。
 */
import {
  BalanceFetchError,
  fetchWithTimeout,
  type BalanceSnapshot,
  type TierTwoBalanceFetcher,
} from "./tier2-fetcher";

const URL = "https://openrouter.ai/api/v1/credits";

interface CreditsResponse {
  data?: {
    total_credits?: number;
    total_usage?: number;
    [key: string]: unknown;
  };
}

export class OpenRouterCreditsFetcher implements TierTwoBalanceFetcher {
  readonly providerName = "openrouter";

  constructor(private readonly auth: { apiKey?: string }) {}

  async fetchBalanceSnapshot(): Promise<BalanceSnapshot[]> {
    if (!this.auth.apiKey) {
      throw new BalanceFetchError(this.providerName, "authConfig.apiKey not configured");
    }

    let response: Response;
    try {
      response = await fetchWithTimeout(URL, {
        method: "GET",
        headers: { Authorization: `Bearer ${this.auth.apiKey}` },
      });
    } catch (err) {
      throw new BalanceFetchError(
        this.providerName,
        `network error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const text = await response.text();
    if (!response.ok) {
      throw new BalanceFetchError(
        this.providerName,
        `HTTP ${response.status}: ${text.slice(0, 200)}`,
        response.status,
      );
    }

    let parsed: CreditsResponse;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new BalanceFetchError(this.providerName, "response is not JSON");
    }

    const data = parsed.data;
    if (!data || typeof data.total_credits !== "number" || typeof data.total_usage !== "number") {
      throw new BalanceFetchError(
        this.providerName,
        "response.data missing total_credits / total_usage",
      );
    }
    const balance = data.total_credits - data.total_usage;
    return [
      {
        providerName: "openrouter",
        snapshotAt: new Date(),
        currency: "USD",
        balance,
        totalUsage: data.total_usage,
        raw: parsed as unknown as Record<string, unknown>,
      },
    ];
  }
}

// Exported for tests
export const __testing = { URL };
