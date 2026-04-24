/**
 * BL-BILLING-AUDIT-EXT-P1 F-BAX-05 — auth_failed detection logic.
 *
 * 覆盖上游已知 auth 错误文案识别，确保连续 3 次 AUTH_ALERT 触发路径
 * 正确匹配 volcengine 欠费 / zhipu ApiKey错误 / openai 401 等。
 */
import { describe, it, expect } from "vitest";
import { isAuthFailedError } from "../scheduler";

describe("F-BAX-05 isAuthFailedError", () => {
  it("matches explicit auth_failed: prefix", () => {
    expect(isAuthFailedError("auth_failed: invalid key")).toBe(true);
  });

  it("matches volcengine 账户欠费 phrasing", () => {
    expect(isAuthFailedError("your account has an overdue balance")).toBe(true);
    expect(isAuthFailedError("账户欠费，请充值后重试")).toBe(true);
  });

  it("matches zhipu 'ApiKey错误' phrasing", () => {
    expect(isAuthFailedError("ApiKey错误")).toBe(true);
    expect(isAuthFailedError("provider_error: ApiKey错误(sk-xxx)")).toBe(true);
  });

  it("matches openai 'Incorrect API key' phrasing", () => {
    expect(isAuthFailedError("Incorrect API key provided: sk-xxx")).toBe(true);
    expect(isAuthFailedError("Invalid API key")).toBe(true);
  });

  it("matches 余额 / balance phrasing", () => {
    expect(isAuthFailedError("余额过低，请充值")).toBe(true);
    expect(isAuthFailedError("余额不足")).toBe(true);
    expect(isAuthFailedError("balance too low")).toBe(true);
    expect(isAuthFailedError("insufficient balance for this request")).toBe(true);
  });

  it("does NOT match unrelated errors (rate_limited / timeout / 5xx)", () => {
    expect(isAuthFailedError("rate_limited: 429 Too Many Requests")).toBe(false);
    expect(isAuthFailedError("timeout")).toBe(false);
    expect(isAuthFailedError("provider_error: 503 Service Unavailable")).toBe(false);
    expect(isAuthFailedError(null)).toBe(false);
    expect(isAuthFailedError("")).toBe(false);
  });
});
