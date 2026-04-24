/**
 * BL-SEC-INFRA-GUARD F-IG-01 — zod schemas for admin mutation endpoints.
 *
 * Every admin handler parses its JSON body through one of these schemas via
 * `schema.parse(body)`. `.strict()` means unknown fields (e.g. `id`, `apiKey`
 * passed as a top-level column) cause a ZodError, which handlers surface as a
 * 400 with the field path. This is the blast-radius fix for CRIT-8, H-11, H-12.
 *
 * `baseUrl` is additionally constrained to http(s) via `.refine` — H-29
 * protection against `file:///` / `javascript:` payloads reaching the outbound
 * fetch path.
 */

import { z } from "zod";

// Accept only http/https URLs. Anything else (file://, javascript:, data:,
// ftp://) is rejected before hitting the fetch layer.
const httpUrl = z
  .string()
  .url()
  .refine(
    (u) => {
      try {
        const protocol = new URL(u).protocol;
        return protocol === "http:" || protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "baseUrl must be an http(s) URL" },
  );

// ============================================================
// ProviderConfig — PATCH /api/admin/providers/:id/config
// ============================================================

// Explicit whitelist mirrors schema.prisma model ProviderConfig. Does NOT
// include `providerId` / `id` — those are path-derived or system-owned.
export const providerConfigUpdateSchema = z
  .object({
    temperatureMin: z.number().optional(),
    temperatureMax: z.number().optional(),
    chatEndpoint: z.string().nullable().optional(),
    imageEndpoint: z.string().nullable().optional(),
    imageViaChat: z.boolean().optional(),
    supportsModelsApi: z.boolean().optional(),
    healthCheckEndpoint: z.string().nullable().optional(),
    supportsSystemRole: z.boolean().optional(),
    currency: z.enum(["USD", "CNY"]).optional(),
    quirks: z.record(z.unknown()).nullable().optional(),
    staticModels: z.unknown().nullable().optional(),
    pricingOverrides: z.record(z.unknown()).nullable().optional(),
    docUrls: z.record(z.unknown()).nullable().optional(),
  })
  .strict();

// ============================================================
// Channel — PATCH /api/admin/channels/:id
// ============================================================

// Admin can re-prioritize, override costPrice, and flip status. providerId /
// modelId / realModelId are immutable FKs. sellPrice moved to ModelAlias.
export const channelUpdateSchema = z
  .object({
    priority: z.number().int().optional(),
    costPrice: z.record(z.unknown()).optional(),
    sellPrice: z.record(z.unknown()).optional(),
    status: z.enum(["ACTIVE", "DEGRADED", "DISABLED"]).optional(),
  })
  .strict();

// ============================================================
// BL-BILLING-AUDIT-EXT-P1 F-BAX-08: IMAGE channel 定价校验
// ============================================================
//
// 修复 2026-04-24 生产事故：40 条 image channel 全体 costPrice.perCall=0，
// 成功调用不计费。Zod 层（此处）给前端 + 脚本做标准化校验；PATCH 路由
// 结合 model.modality 做二次校验后返回 400 IMAGE_CHANNEL_REQUIRES_PERCALL_PRICE。

/** 对 IMAGE modality 的 channel 强制 `{unit:'call', perCall>0}` */
export function imageChannelPriceValid(price: unknown): boolean {
  if (!price || typeof price !== "object") return false;
  const p = price as { unit?: unknown; perCall?: unknown };
  if (p.unit !== "call") return false;
  if (typeof p.perCall !== "number") return false;
  return p.perCall > 0;
}

/**
 * 对合并了 model.modality 的 channel 更新做校验：
 *   - IMAGE + costPrice 传入但 perCall<=0 → fail
 *   - IMAGE + sellPrice 传入但 perCall<=0 → fail
 *   - TEXT / 其他 modality 不做约束
 * 返回 null 表示通过；返回 string 为错误 message。
 */
export function validateChannelPriceForModality(
  modality: string,
  costPrice: unknown,
  sellPrice?: unknown,
): string | null {
  if (modality !== "IMAGE") return null;
  if (costPrice !== undefined && !imageChannelPriceValid(costPrice)) {
    return "图片渠道 costPrice 必须为 {unit:'call', perCall>0}";
  }
  if (sellPrice !== undefined && !imageChannelPriceValid(sellPrice)) {
    return "图片渠道 sellPrice 必须为 {unit:'call', perCall>0}";
  }
  return null;
}

// ============================================================
// Model — POST /api/admin/models
// ============================================================

const MODALITIES = ["TEXT", "IMAGE", "VIDEO", "AUDIO"] as const;

export const modelCreateSchema = z
  .object({
    name: z.string().min(1),
    displayName: z.string().min(1),
    modality: z.enum(MODALITIES),
    enabled: z.boolean().optional(),
    maxTokens: z.number().int().nullable().optional(),
    contextWindow: z.number().int().nullable().optional(),
    capabilities: z.record(z.unknown()).nullable().optional(),
    supportedSizes: z.array(z.string()).nullable().optional(),
    description: z.string().nullable().optional(),
  })
  .strict();

// ============================================================
// Model — PATCH /api/admin/models/:id
// ============================================================

// Mirrors the hand-rolled logic previously in models/[id]/route.ts: admin may
// flip enabled, update capabilities (validated keys), update supportedSizes.
export const VALID_CAPABILITY_KEYS = [
  "streaming",
  "json_mode",
  "function_calling",
  "vision",
  "reasoning",
  "search",
] as const;

const capabilityKey = z.enum(VALID_CAPABILITY_KEYS);

export const modelUpdateSchema = z
  .object({
    enabled: z.boolean().optional(),
    capabilities: z.record(capabilityKey, z.boolean()).optional(),
    supportedSizes: z.array(z.string()).nullable().optional(),
  })
  .strict();

// ============================================================
// Provider — POST /api/admin/providers
// ============================================================

export const providerCreateSchema = z
  .object({
    name: z.string().min(1),
    displayName: z.string().min(1),
    baseUrl: httpUrl,
    authType: z.string().optional(),
    apiKey: z.string().optional(),
    adapterType: z.string().optional(),
    proxyUrl: z.string().nullable().optional(),
    rateLimit: z.record(z.unknown()).nullable().optional(),
  })
  .strict();

// ============================================================
// Provider — PATCH /api/admin/providers/:id
// ============================================================

// `name` is intentionally excluded: it is the canonical key used by adapters
// and health checks, renaming breaks routing. Admin must recreate the row to
// change the key.
export const providerUpdateSchema = z
  .object({
    displayName: z.string().optional(),
    baseUrl: httpUrl.optional(),
    authType: z.string().optional(),
    apiKey: z.string().optional(),
    adapterType: z.string().optional(),
    proxyUrl: z.string().nullable().optional(),
    status: z.enum(["ACTIVE", "DISABLED"]).optional(),
    rateLimit: z.record(z.unknown()).nullable().optional(),
    // BL-BILLING-AUDIT-EXT-P1 F-BAX-06: billing audit 账单 fetcher 凭证，
    // merge 进 authConfig（不是独立 columns）。只有特定 provider 会用到：
    //   volcengine: billingAccessKeyId + billingSecretAccessKey (V4 AK/SK)
    //   openrouter: provisioningKey (is_management_key=true)
    billingAccessKeyId: z.string().optional(),
    billingSecretAccessKey: z.string().optional(),
    provisioningKey: z.string().optional(),
  })
  .strict();

// ============================================================
// Shared helper: turn a ZodError into a 400 payload.
// ============================================================

import { NextResponse } from "next/server";
import type { ZodError } from "zod";
import { Prisma } from "@prisma/client";

export function zodErrorResponse(err: ZodError): NextResponse {
  return NextResponse.json(
    {
      error: "invalid_parameter",
      message: "Request body failed schema validation",
      errors: err.issues.map((i) => ({ path: i.path, message: i.message })),
    },
    { status: 400 },
  );
}

/**
 * Rewrite bare `null` on known JSON-typed fields to Prisma.JsonNull. The zod
 * schemas accept `null` as a "clear this column" signal, but Prisma's
 * NullableJsonNullValueInput requires the sentinel. Non-JSON fields (and
 * non-listed ones) pass through unchanged.
 */
export function mapJsonNulls<T extends Record<string, unknown>>(
  data: T,
  jsonFields: readonly string[],
): T {
  const set = new Set(jsonFields);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === null && set.has(k)) {
      out[k] = Prisma.JsonNull;
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

// Field groups per model — keep in sync with schema.prisma JSON columns.
export const PROVIDER_CONFIG_JSON_FIELDS = [
  "quirks",
  "staticModels",
  "pricingOverrides",
  "docUrls",
] as const;

export const MODEL_JSON_FIELDS = ["capabilities", "supportedSizes"] as const;

export const PROVIDER_JSON_FIELDS = ["rateLimit"] as const;
