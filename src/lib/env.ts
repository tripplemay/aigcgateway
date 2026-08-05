import { z } from "zod";

const envSchema = z.object({
  // 核心配置
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),

  // 域名
  DOMAIN: z.string().optional(),
  API_BASE_URL: z.string().url().optional(),
  SITE_URL: z.string().url().optional(),
  CDN_BASE_URL: z.string().url().optional(),

  // 数据库
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DATABASE_READ_URL: z.string().optional(),

  // Redis
  REDIS_URL: z.string().optional(),

  // 认证
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  JWT_EXPIRES_IN: z.string().default("7d"),

  // 加密主密钥
  ENCRYPTION_KEY: z.string().min(32, "ENCRYPTION_KEY must be at least 32 characters"),

  // 代理
  PROXY_URL_PRIMARY: z.string().optional(),
  PROXY_URL_SECONDARY: z.string().optional(),

  // 支付
  // BL-SEC-HOTFIX-2608 F-SH-02: 支付链路总开关，默认关闭。见下方 isPaymentEnabled()。
  PAYMENT_ENABLED: z.string().optional(),
  ALIPAY_APP_ID: z.string().optional(),
  ALIPAY_PRIVATE_KEY: z.string().optional(),
  ALIPAY_PUBLIC_KEY: z.string().optional(),
  ALIPAY_NOTIFY_URL: z.string().optional(),

  WECHAT_MCH_ID: z.string().optional(),
  WECHAT_API_KEY_V3: z.string().optional(),
  WECHAT_CERT_SERIAL: z.string().optional(),
  WECHAT_PRIVATE_KEY: z.string().optional(),
  WECHAT_NOTIFY_URL: z.string().optional(),

  // 汇率
  EXCHANGE_RATE_CNY_TO_USD: z.coerce.number().default(0.137),

  // 健康检查
  HEALTH_CHECK_ACTIVE_INTERVAL_MS: z.coerce.number().default(600_000),
  HEALTH_CHECK_STANDBY_INTERVAL_MS: z.coerce.number().default(1_800_000),
  HEALTH_CHECK_COLD_INTERVAL_MS: z.coerce.number().default(7_200_000),
  HEALTH_CHECK_FAIL_THRESHOLD: z.coerce.number().default(3),

  // 限流
  DEFAULT_RPM: z.coerce.number().default(60),
  DEFAULT_TPM: z.coerce.number().default(100_000),
  DEFAULT_IMAGE_RPM: z.coerce.number().default(10),

  // 告警
  ALERT_WEBHOOK_URL: z.string().optional(),
  ALERT_EMAIL: z.string().email().optional(),

  // 日志
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  LOG_FORMAT: z.enum(["json", "pretty"]).default("json"),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Lazy singleton — validated on first access, not at import time.
 * This prevents build-time errors when env vars are not yet available.
 */
let _env: Env | null = null;

export function getEnv(): Env {
  if (_env) return _env;

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Environment variable validation failed:\n${formatted}`);
  }

  _env = result.data;
  return _env;
}

/** @deprecated Use getEnv() for lazy validation. Kept for backward compat. */
export const env = new Proxy({} as Env, {
  get(_target, prop: string) {
    return getEnv()[prop as keyof Env];
  },
});

/**
 * BL-SEC-HOTFIX-2608 F-SH-02 — 支付链路总开关。
 *
 * 全量审查（docs/code-review/backend-fullscan-2026-08-04.md C1/C2）确认这条链路
 * 从未接通：无支付 SDK 依赖、ALIPAY_* / WECHAT_* 全部未配置、recharge 返回的
 * paymentUrl 是缺 sign 的手拼串。而两个 webhook 完全无验签，配合 recharge 直接
 * 回传 paymentOrderId，构成"任意用户自助无限充值"。
 *
 * 因此三个用户侧支付端点在此开关未显式打开时一律 410。admin 手动充值
 * (/api/admin/users/[id]/recharge) 不受影响，是当前唯一的合法充值路径。
 *
 * 重新打开此开关前必须先完成（缺一不可）：
 *   1. 支付宝 RSA2 验签 + 微信 WECHATPAY2-SHA256-RSA2048 验签与 AEAD 解密
 *   2. processPaymentCallback 的幂等 CAS（审查 C2）——验签替代不了它，真实支付
 *      网关的重试会并发触达，两个根因独立
 *   3. paymentUrl 改为真实 SDK 生成
 *
 * 显式比较 "true"：不能用 z.coerce.boolean()，因为字符串 "false" 也是 truthy。
 */
export function isPaymentEnabled(): boolean {
  return process.env.PAYMENT_ENABLED === "true";
}

/**
 * Asserts that at least one of IMAGE_PROXY_SECRET / AUTH_SECRET / NEXTAUTH_SECRET is set.
 * Called from src/instrumentation.ts at startup to fail-fast instead of erroring on
 * first image-proxy request.
 */
export function assertImageProxySecret(): void {
  const secret =
    process.env.IMAGE_PROXY_SECRET || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("IMAGE_PROXY_SECRET (or AUTH_SECRET / NEXTAUTH_SECRET) is required");
  }
}
