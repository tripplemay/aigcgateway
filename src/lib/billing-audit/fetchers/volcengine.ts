/**
 * BL-BILLING-AUDIT-EXT-P1 F-BAX-06 — Volcengine 账单 fetcher.
 *
 * POST https://open.volcengineapi.com/?Action=ListBillDetail&Version=2022-01-01
 * V4 签名：HMAC-SHA256，service="billing"，region="cn-beijing"
 *
 * 认证来自 provider.authConfig.billingAccessKeyId + billingSecretAccessKey
 * （与 ark-ef66 model inference key 不同——账单 API 用独立 AK/SK）
 *
 * 参考：https://www.volcengine.com/docs/6256/1116145
 */
import { createHash, createHmac } from "node:crypto";
import {
  type BillRecord,
  type BillingAuthConfig,
  type TierOneBillFetcher,
  BillFetchError,
  formatBillPeriodYYYYMM,
} from "./tier1-fetcher";

const HOST = "open.volcengineapi.com";
const SERVICE = "billing";
const REGION = "cn-beijing";
const ACTION = "ListBillDetail";
const VERSION = "2022-01-01";

interface ListBillDetailItem {
  BillPeriod?: string;
  BillDay?: string;
  BusinessName?: string;
  ProductName?: string;
  ConfigName?: string; // fix-round-1 Bug 3: Volcengine 实际 modelName 字段（如 'doubao-lite-4k'）
  InstanceName?: string;
  Element?: string;
  Region?: string;
  Count?: string | number;
  Price?: string | number;
  Currency?: string;
  PayableAmount?: string | number;
  [key: string]: unknown;
}

interface ListBillDetailResponse {
  Result?: {
    List?: ListBillDetailItem[];
    Total?: number;
  };
  ResponseMetadata?: {
    RequestId?: string;
    Error?: { Code?: string; Message?: string };
  };
}

export class VolcengineBillFetcher implements TierOneBillFetcher {
  readonly providerName = "volcengine";

  constructor(private readonly auth: BillingAuthConfig) {}

  async fetchDailyBill(date: Date): Promise<BillRecord[]> {
    const accessKey = this.auth.billingAccessKeyId;
    const secretKey = this.auth.billingSecretAccessKey;
    if (!accessKey || !secretKey) {
      throw new BillFetchError(
        this.providerName,
        "authConfig.billingAccessKeyId / billingSecretAccessKey not configured",
      );
    }

    const billPeriod = formatBillPeriodYYYYMM(date);
    const payload = {
      BillPeriod: billPeriod,
      Limit: 200,
      Offset: 0,
      NeedRecordNum: 1,
      GroupPeriod: 1, // 按天分组
    };
    const bodyStr = JSON.stringify(payload);

    const { url, headers } = signV4({
      method: "POST",
      host: HOST,
      path: "/",
      query: `Action=${ACTION}&Version=${VERSION}`,
      body: bodyStr,
      accessKey,
      secretKey,
      service: SERVICE,
      region: REGION,
    });

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers,
        body: bodyStr,
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

    let parsed: ListBillDetailResponse;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new BillFetchError(this.providerName, "response is not JSON");
    }

    const upstreamError = parsed.ResponseMetadata?.Error;
    if (upstreamError?.Code) {
      throw new BillFetchError(
        this.providerName,
        `${upstreamError.Code}: ${upstreamError.Message ?? ""}`,
      );
    }

    const list = parsed.Result?.List ?? [];
    return list.map((item) => normalizeBillItem(item, date));
  }
}

function normalizeBillItem(item: ListBillDetailItem, requestedDate: Date): BillRecord {
  // BillDay 格式 "YYYY-MM-DD"；缺失时 fallback 到请求日
  const billDay = typeof item.BillDay === "string" ? item.BillDay : null;
  const date = billDay ? new Date(`${billDay}T00:00:00Z`) : new Date(requestedDate);
  const amount = toNumber(item.PayableAmount);
  const count = toNumber(item.Count);
  // fix-round-1 Bug 3: 实际 Volcengine ListBillDetail 返回：
  //   ConfigName = 实际 model 名（如 'doubao-lite-4k'）— 首选
  //   InstanceName = ep-xxx endpoint id，且常常为空字符串 ""
  //   ProductName = 产品线（如 'Doubao'）— category 兜底
  // 旧逻辑用 `??` + null 保护，但空字符串是 truthy-string → 短路 → modelName
  // 全空（2026-04-24 生产 118 条 evidence）。改用显式 trim() 过滤 + 多级 fallback。
  const firstNonEmpty = (...candidates: Array<string | undefined | null>): string | null => {
    for (const c of candidates) {
      if (typeof c === "string" && c.trim().length > 0) return c.trim();
    }
    return null;
  };
  const modelName =
    firstNonEmpty(item.ConfigName, item.InstanceName, item.ProductName) ?? "unknown";
  const currency = item.Currency === "USD" ? "USD" : "CNY";
  return {
    date,
    modelName,
    requests: Number.isFinite(count) ? count : null,
    amount,
    currency,
    raw: item as Record<string, unknown>,
  };
}

function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

// ============================================================
// Volcengine V4 签名实现
// ============================================================

interface SignV4Params {
  method: string;
  host: string;
  path: string;
  query: string;
  body: string;
  accessKey: string;
  secretKey: string;
  service: string;
  region: string;
}

interface SignedRequest {
  url: string;
  headers: Record<string, string>;
}

/**
 * Volcengine V4 签名（HMAC-SHA256）。格式大致与 AWS SigV4 一致但 domain
 * 不同。导出供单测断言签名字符串不漂移。
 */
export function signV4(params: SignV4Params): SignedRequest {
  const date = new Date();
  const amzDate = formatAmzDate(date); // 20260424T102030Z
  const dateStamp = amzDate.slice(0, 8); // 20260424
  const contentSha256 = sha256Hex(params.body);

  const canonicalHeaders =
    `content-type:application/json\n` +
    `host:${params.host}\n` +
    `x-content-sha256:${contentSha256}\n` +
    `x-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-content-sha256;x-date";

  const canonicalRequest = [
    params.method,
    params.path,
    params.query,
    canonicalHeaders,
    signedHeaders,
    contentSha256,
  ].join("\n");

  const credentialScope = `${dateStamp}/${params.region}/${params.service}/request`;
  const stringToSign = ["HMAC-SHA256", amzDate, credentialScope, sha256Hex(canonicalRequest)].join(
    "\n",
  );

  const kDate = hmacSha256(params.secretKey, dateStamp);
  const kRegion = hmacSha256(kDate, params.region);
  const kService = hmacSha256(kRegion, params.service);
  const kSigning = hmacSha256(kService, "request");
  const signature = hmacSha256Hex(kSigning, stringToSign);

  const authorization =
    `HMAC-SHA256 Credential=${params.accessKey}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, ` +
    `Signature=${signature}`;

  const url = `https://${params.host}${params.path}?${params.query}`;
  const headers = {
    "Content-Type": "application/json",
    Host: params.host,
    "X-Content-Sha256": contentSha256,
    "X-Date": amzDate,
    Authorization: authorization,
  };
  return { url, headers };
}

function formatAmzDate(d: Date): string {
  const y = d.getUTCFullYear();
  const M = String(d.getUTCMonth() + 1).padStart(2, "0");
  const D = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  const s = String(d.getUTCSeconds()).padStart(2, "0");
  return `${y}${M}${D}T${h}${m}${s}Z`;
}

function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function hmacSha256(key: string | Buffer, msg: string): Buffer {
  return createHmac("sha256", key).update(msg).digest();
}

function hmacSha256Hex(key: Buffer, msg: string): string {
  return createHmac("sha256", key).update(msg).digest("hex");
}

// Exported for tests
export const __testing = { signV4, formatAmzDate, normalizeBillItem };
