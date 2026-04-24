/**
 * BL-BILLING-AUDIT-EXT-P1 F-BAX-05 — sanitizeErrorMessage 扩充规则。
 *
 * 修复 2026-04-22 生产事故：chatanywhere / zhipu 余额不足错误文本
 * 含充值 URL + 上游 ApiKey 片段，直接透传给终端用户。
 */
import { describe, it, expect } from "vitest";
import { sanitizeErrorMessage } from "../types";

describe("F-BAX-05 sanitize new rules", () => {
  it("replaces '前往 URL 充值' with 上游配额不足提示 and drops the URL", () => {
    const out = sanitizeErrorMessage(
      "余额过低，请前往 https://example.com/recharge 充值后重试",
    );
    expect(out).not.toMatch(/https?:\/\//);
    expect(out).toContain("上游配额不足，已联系管理员");
  });

  it("replaces '前往 ... 充值' phrase without URL", () => {
    const out = sanitizeErrorMessage("请前往充值中心充值");
    expect(out).toContain("上游配额不足，已联系管理员");
  });

  it("removes '当前请求使用的 ApiKey: sk-xxx' leak entirely", () => {
    const out = sanitizeErrorMessage(
      "认证失败（当前请求使用的 ApiKey:sk-proj-abc123def456）",
    );
    expect(out).not.toMatch(/sk-proj/);
    expect(out).not.toMatch(/ApiKey\s*:/i);
  });

  it("removes '当前 ApiKey: masked' leak entirely", () => {
    const out = sanitizeErrorMessage("当前 ApiKey:sk-ant-xxxxxxxx");
    expect(out).not.toMatch(/sk-ant/);
    expect(out).not.toMatch(/ApiKey\s*:/i);
  });

  it("rewrites 'ApiKey错误' to neutral 认证失败 text", () => {
    const out = sanitizeErrorMessage("ApiKey错误，请检查密钥");
    expect(out).toContain("认证失败");
    expect(out).not.toContain("ApiKey错误");
  });

  it("rewrites '无效的 ApiKey' to 认证失败", () => {
    const out = sanitizeErrorMessage("无效的 ApiKey 请联系技术支持");
    expect(out).toContain("认证失败");
  });

  it("keeps generic error text untouched", () => {
    expect(sanitizeErrorMessage("An error occurred")).toMatch(/error/i);
  });
});
