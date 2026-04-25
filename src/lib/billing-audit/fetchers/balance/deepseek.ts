/**
 * BL-BILLING-AUDIT-EXT-P2 F-BAP2-01 — DeepSeek balance fetcher.
 *
 * GET https://api.deepseek.com/user/balance
 * Auth: Bearer <apiKey>
 *
 * 返回 multi-currency balance_infos：
 * {
 *   "is_available": true,
 *   "balance_infos": [
 *     {"currency": "CNY", "total_balance": "..", "granted_balance": "..", "topped_up_balance": ".."},
 *     {"currency": "USD", "total_balance": "..", ...}
 *   ]
 * }
 *
 * 每条 balance_info → 一个 BalanceSnapshot。
 */
import {
  BalanceFetchError,
  fetchWithTimeout,
  type BalanceSnapshot,
  type TierTwoBalanceFetcher,
} from "./tier2-fetcher";

const URL = "https://api.deepseek.com/user/balance";

interface DeepSeekBalanceInfo {
  currency?: string;
  total_balance?: string;
  granted_balance?: string;
  topped_up_balance?: string;
}

interface DeepSeekResponse {
  is_available?: boolean;
  balance_infos?: DeepSeekBalanceInfo[];
}

export class DeepSeekBalanceFetcher implements TierTwoBalanceFetcher {
  readonly providerName = "deepseek";

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

    let parsed: DeepSeekResponse;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new BalanceFetchError(this.providerName, "response is not JSON");
    }

    const infos = parsed.balance_infos ?? [];
    if (infos.length === 0) {
      throw new BalanceFetchError(this.providerName, "balance_infos missing/empty");
    }

    const at = new Date();
    return infos.map((info) => normalizeInfo(info, at, parsed));
  }
}

function normalizeInfo(
  info: DeepSeekBalanceInfo,
  at: Date,
  raw: DeepSeekResponse,
): BalanceSnapshot {
  const currencyRaw = (info.currency ?? "CNY").toUpperCase();
  const currency: "CNY" | "USD" = currencyRaw === "USD" ? "USD" : "CNY";
  const balance = Number(info.total_balance ?? "0");
  return {
    providerName: "deepseek",
    snapshotAt: at,
    currency,
    balance: Number.isFinite(balance) ? balance : 0,
    raw: { info, response: raw } as Record<string, unknown>,
  };
}

// Exported for tests
export const __testing = { URL, normalizeInfo };
