/**
 * BL-BILLING-AUDIT-EXT-P2 F-BAP2-01 — SiliconFlow balance fetcher.
 *
 * GET https://api.siliconflow.cn/v1/user/info
 * Auth: Bearer <apiKey>
 *
 * 返回 single-currency CNY，totalBalance 是字符串：
 * { "code": 20000, "data": { "totalBalance": "-1.7582", ... } }
 *
 * 注意：totalBalance 可为负数（欠费状态），不能截断到 0。
 */
import {
  BalanceFetchError,
  fetchWithTimeout,
  type BalanceSnapshot,
  type TierTwoBalanceFetcher,
} from "./tier2-fetcher";

const URL = "https://api.siliconflow.cn/v1/user/info";

interface SiliconFlowResponse {
  code?: number;
  status?: string;
  data?: {
    totalBalance?: string | number;
    chargeBalance?: string | number;
    balance?: string | number;
    [key: string]: unknown;
  };
  message?: string;
}

export class SiliconFlowBalanceFetcher implements TierTwoBalanceFetcher {
  readonly providerName = "siliconflow";

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

    let parsed: SiliconFlowResponse;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new BalanceFetchError(this.providerName, "response is not JSON");
    }

    if (parsed.code !== undefined && parsed.code !== 20000) {
      throw new BalanceFetchError(
        this.providerName,
        `upstream code=${parsed.code} ${parsed.message ?? ""}`,
      );
    }

    const data = parsed.data;
    if (!data) {
      throw new BalanceFetchError(this.providerName, "response.data missing");
    }
    // 优先 totalBalance；fallback 到 balance（不同版本字段名）
    const balanceRaw = data.totalBalance ?? data.balance ?? "0";
    const balance = Number(balanceRaw);
    return [
      {
        providerName: "siliconflow",
        snapshotAt: new Date(),
        currency: "CNY",
        balance: Number.isFinite(balance) ? balance : 0,
        raw: parsed as unknown as Record<string, unknown>,
      },
    ];
  }
}

// Exported for tests
export const __testing = { URL };
