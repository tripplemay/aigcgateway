/**
 * 健康检查验证器 V2
 *
 * 检查级别：
 *   API_REACHABILITY：GET /models 探测（零成本）
 *   CONNECTIVITY (L1)：发真实 chat 请求验证
 *   FORMAT (L2)：响应格式一致性
 *   QUALITY (L3)：响应内容质量
 *
 * 通道类型决定检查方式：
 *   文本通道（已纳入已启用别名）：全三级 CONNECTIVITY → FORMAT → QUALITY
 *   图片通道 / 未纳入别名通道：仅 API_REACHABILITY
 */

import type { HealthCheckLevel, HealthCheckResult } from "@prisma/client";
import type { RouteResult } from "../engine/types";
import { EngineError } from "../engine/types";
import { getAdapterForRoute } from "../engine/router";
import { writeProbeCallLog } from "@/lib/api/post-process";

/**
 * BL-HEALTH-PROBE-MIN-TOKENS F-HPMT-01: probe chat max_tokens floor.
 *
 * BL-HEALTH-PROBE-LEAN F-HPL-01 had pushed this to 1 (cost saving).
 * BL-HEALTH-PROBE-MIN-TOKENS restores 16 because OpenRouter Azure-backed
 * models (e.g. openai/gpt-5) reject max_output_tokens < 16 with
 * `invalid_request_error: Expected >= 16, got 1`, which causes the probe
 * to permanently FAIL and silently hides the alias from /v1/models
 * (BL-ALIAS-MODEL-CASCADE-ENABLE Bug-D root cause).
 *
 * Cost impact: 16 × 46 ACTIVE channels × 144 probes/day × 30 days
 *              ≈ 3.18M tokens/month ≈ $0.45/month — acceptable.
 *
 * Used by runCallProbe (CALL_PROBE level), runTextCheck (CONNECTIVITY level),
 * and post-process.writeProbeCallLog (audit metadata). Single source of truth —
 * do not inline.
 */
export const PROBE_MAX_TOKENS = 16;

export interface CheckResult {
  level: HealthCheckLevel;
  result: HealthCheckResult;
  latencyMs: number;
  errorMessage: string | null;
  responseBody: string | null;
}

/**
 * BL-BILLING-AUDIT-EXT-P1 F-BAX-02: probe 触发来源。
 * 'probe' = scheduler 自动 / 'admin_health' = admin 手动。进 call_logs.source。
 */
export type ProbeSource = "probe" | "admin_health";

/**
 * 对一个通道执行全三级检查（文本通道）
 */
export async function runHealthCheck(
  route: RouteResult,
  source: ProbeSource = "probe",
): Promise<CheckResult[]> {
  return runTextCheck(route, source);
}

/**
 * BL-EMBEDDING-MVP fix-round-2: probe modality 类型，决定调哪个 adapter 接口。
 *
 * - 'TEXT' / 'VIDEO' / 'AUDIO' → adapter.chatCompletions (current default)
 *   VIDEO/AUDIO 暂无 adapter 方法，但代码也不会到这里（modality 在 router /
 *   sync 阶段过滤）；保守 fallback 走 chat 路径
 * - 'IMAGE' → adapter.imageGenerations
 * - 'EMBEDDING' → adapter.embeddings({ input:'hi' })
 */
type ProbeModality = "TEXT" | "IMAGE" | "EMBEDDING" | "VIDEO" | "AUDIO";

function resolveProbeModality(route: RouteResult): ProbeModality {
  // alias modality 优先（可能与 model.modality 不一致；保留旧 isImage 兼容）
  const aliasModality = route.alias?.modality;
  if (aliasModality === "IMAGE" || aliasModality === "EMBEDDING") return aliasModality;
  return (route.model.modality ?? "TEXT") as ProbeModality;
}

/**
 * F-ACF-10 — minimal real-call probe.
 *
 * BL-EMBEDDING-MVP fix-round-2: 加 EMBEDDING 分支。原 isImage 二分逻辑下
 * EMBEDDING 走默认 chat path → 上游 400 → channel 自动 DEGRADED（生产
 * bge-m3 + text-embedding-3-small 两条 channel 都被锁）。
 *
 * Modality 路由：
 *   IMAGE     → adapter.imageGenerations({prompt:'a dot'})
 *   EMBEDDING → adapter.embeddings({input:'hi'}) — 失败 fallback 到 chat
 *               不可（embedding 模型对 chat endpoint 必返 400）
 *   else      → adapter.chatCompletions({max_tokens:PROBE_MAX_TOKENS})
 *
 * adapter.embeddings 缺失时（旧 adapter）跳过返 PASS，避免误降级。
 */
export async function runCallProbe(
  route: RouteResult,
  source: ProbeSource = "probe",
): Promise<CheckResult> {
  const start = Date.now();
  const adapter = getAdapterForRoute(route);
  const modality = resolveProbeModality(route);
  const traceId = `${source}_${route.channel.id}_${start}`;
  try {
    if (modality === "IMAGE") {
      const supported = (route.model.supportedSizes as string[] | null) ?? [];
      const size = supported[0] ?? "1024x1024";
      const res = await adapter.imageGenerations(
        { model: route.model.name, prompt: "a dot", size },
        route,
      );
      const ok = (res.data ?? []).length > 0;
      writeProbeCallLog({
        traceId,
        route,
        source,
        startTime: start,
        response: res,
        isImage: true,
      });
      return {
        level: "CALL_PROBE",
        result: ok ? "PASS" : "FAIL",
        latencyMs: Date.now() - start,
        errorMessage: ok ? null : "Probe returned zero images",
        responseBody: null,
      };
    }
    if (modality === "EMBEDDING") {
      // 旧 adapter 不支持 embeddings 时跳过；保守返 PASS 避免误降级
      if (!adapter.embeddings) {
        return {
          level: "CALL_PROBE",
          result: "PASS",
          latencyMs: Date.now() - start,
          errorMessage: null,
          responseBody: "skipped: adapter has no embeddings()",
        };
      }
      const res = await adapter.embeddings({ model: route.model.name, input: "hi" }, route);
      const ok = (res.data ?? []).length > 0;
      // embedding 不走 image-cost path；写 call_log 时按 chat shape（isImage:false）
      // post-process probe log 不写 cost（probe source 不扣费）
      writeProbeCallLog({
        traceId,
        route,
        source,
        startTime: start,
        // probe call log 接受 chat / image response；embedding 暂用 chat 形态填充
        // 关键字段（latency / source）独立于 response shape，验收无影响
        error: ok ? undefined : { message: "Probe returned zero embeddings" },
        isImage: false,
      });
      return {
        level: "CALL_PROBE",
        result: ok ? "PASS" : "FAIL",
        latencyMs: Date.now() - start,
        errorMessage: ok ? null : "Probe returned zero embeddings",
        responseBody: null,
      };
    }
    const res = await adapter.chatCompletions(
      {
        model: route.model.name,
        messages: [{ role: "user", content: "hi" }],
        max_tokens: PROBE_MAX_TOKENS,
        temperature: 0,
      },
      route,
    );
    const ok = !!res.choices?.length;
    writeProbeCallLog({
      traceId,
      route,
      source,
      startTime: start,
      response: res,
      isImage: false,
    });
    return {
      level: "CALL_PROBE",
      result: ok ? "PASS" : "FAIL",
      latencyMs: Date.now() - start,
      errorMessage: ok ? null : "Probe returned no choices",
      responseBody: null,
    };
  } catch (err) {
    const message =
      err instanceof EngineError ? `${err.code}: ${err.message}` : (err as Error).message;
    const code = err instanceof EngineError ? err.code : undefined;
    writeProbeCallLog({
      traceId,
      route,
      source,
      startTime: start,
      error: { message, code },
      isImage: modality === "IMAGE",
    });
    return {
      level: "CALL_PROBE",
      result: "FAIL",
      latencyMs: Date.now() - start,
      errorMessage: message,
      responseBody: null,
    };
  }
}

/**
 * 仅执行 API_REACHABILITY 检查（GET /models，零成本）
 * healthCheckEndpoint 为 "skip" 时直接返回 PASS，不发请求
 */
export async function runApiReachabilityCheck(route: RouteResult): Promise<CheckResult[]> {
  if (route.config.healthCheckEndpoint === "skip") {
    return [
      {
        level: "API_REACHABILITY",
        result: "PASS",
        latencyMs: 0,
        errorMessage: null,
        responseBody: null,
      },
    ];
  }
  return runReachabilityCheck(route);
}

// ============================================================
// API_REACHABILITY 检查（零成本）
// ============================================================

async function runReachabilityCheck(route: RouteResult): Promise<CheckResult[]> {
  const start = Date.now();
  const baseUrl = route.provider.baseUrl.replace(/\/+$/, "");
  const authConfig = route.provider.authConfig as { apiKey?: string } | null;
  const apiKey = authConfig?.apiKey ?? "";
  const proxyUrl = route.provider.proxyUrl ?? process.env.PROXY_URL_PRIMARY ?? null;

  try {
    let response: Response;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);

    try {
      if (proxyUrl) {
        const { ProxyAgent, fetch: undiciFetch } = await import("undici");
        const dispatcher = new ProxyAgent(proxyUrl);
        response = await (undiciFetch as unknown as typeof fetch)(`${baseUrl}/models`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: controller.signal,
          // @ts-expect-error undici dispatcher option
          dispatcher,
        });
      } else {
        response = await fetch(`${baseUrl}/models`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: controller.signal,
        });
      }
    } finally {
      clearTimeout(timeoutId);
    }

    const latencyMs = Date.now() - start;
    const body = await response.text();

    if (!response.ok || !body) {
      return [
        {
          level: "API_REACHABILITY",
          result: "FAIL",
          latencyMs,
          errorMessage: `HTTP ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
          responseBody: body.slice(0, 2000),
        },
      ];
    }

    let parsed: { data?: unknown[] } | null = null;
    try {
      parsed = JSON.parse(body);
    } catch {
      /* not JSON */
    }

    if (!parsed || !Array.isArray(parsed.data)) {
      return [
        {
          level: "API_REACHABILITY",
          result: "FAIL",
          latencyMs,
          errorMessage: "Response missing data array",
          responseBody: body.slice(0, 500),
        },
      ];
    }

    return [
      {
        level: "API_REACHABILITY",
        result: "PASS",
        latencyMs,
        errorMessage: null,
        responseBody: null,
      },
    ];
  } catch (err) {
    const latencyMs = Date.now() - start;
    const message =
      err instanceof EngineError ? `${err.code}: ${err.message}` : (err as Error).message;
    return [
      {
        level: "API_REACHABILITY",
        result: "FAIL",
        latencyMs,
        errorMessage: message,
        responseBody: null,
      },
    ];
  }
}

// ============================================================
// 文本通道检查（单级 CONNECTIVITY）
// ============================================================
//
// BL-HEALTH-PROBE-LEAN F-HPL-01: probe reduced to a single 1-token call.
// The previous three-tier check (CONNECTIVITY / FORMAT / QUALITY) issued a
// real chat(max_tokens:200) every 10min against every ACTIVE aliased text
// channel, burning ~1.3M tokens/day in aggregate (chatanywhere + openrouter
// 2026-04-20 bills). New contract: "1 token returned → channel is healthy";
// FORMAT / QUALITY signal moves to real-traffic metrics (F-HPL-03 call_logs
// p50/p95). Caller contract unchanged — still CheckResult[]. handleFailure's
// "any FAIL → degrade" logic works identically with 1 row vs 3.

async function runTextCheck(
  route: RouteResult,
  source: ProbeSource = "probe",
): Promise<CheckResult[]> {
  const adapter = getAdapterForRoute(route);
  const start = Date.now();
  const traceId = `${source}_${route.channel.id}_${start}`;
  const modality = resolveProbeModality(route);

  // BL-EMBEDDING-MVP fix-round-2: EMBEDDING modality 走 adapter.embeddings
  // (1-token input)。原 runTextCheck 不分 modality 一律 chatCompletions →
  // EMBEDDING channel 100% FAIL。
  if (modality === "EMBEDDING") {
    if (!adapter.embeddings) {
      return [
        {
          level: "CONNECTIVITY",
          result: "PASS",
          latencyMs: Date.now() - start,
          errorMessage: null,
          responseBody: "skipped: adapter has no embeddings()",
        },
      ];
    }
    try {
      const res = await adapter.embeddings({ model: route.model.name, input: "hi" }, route);
      const latencyMs = Date.now() - start;
      const ok = (res.data ?? []).length > 0;
      writeProbeCallLog({
        traceId,
        route,
        source,
        startTime: start,
        error: ok ? undefined : { message: "Empty embeddings data" },
        isImage: false,
      });
      return [
        {
          level: "CONNECTIVITY",
          result: ok ? "PASS" : "FAIL",
          latencyMs,
          errorMessage: ok ? null : "Empty response or no embeddings",
          responseBody: ok ? `embedding[${res.data[0]?.embedding?.length ?? 0}]` : null,
        },
      ];
    } catch (err) {
      const latencyMs = Date.now() - start;
      const message =
        err instanceof EngineError ? `${err.code}: ${err.message}` : (err as Error).message;
      const code = err instanceof EngineError ? err.code : undefined;
      writeProbeCallLog({
        traceId,
        route,
        source,
        startTime: start,
        error: { message, code },
        isImage: false,
      });
      return [
        {
          level: "CONNECTIVITY",
          result: "FAIL",
          latencyMs,
          errorMessage: message,
          responseBody: null,
        },
      ];
    }
  }

  // TEXT (default) path
  try {
    const response = await adapter.chatCompletions(
      {
        model: route.model.name,
        messages: [{ role: "user", content: "hi" }],
        max_tokens: PROBE_MAX_TOKENS,
        temperature: 0,
      },
      route,
    );

    const latencyMs = Date.now() - start;
    const ok = !!response?.choices?.length;

    writeProbeCallLog({
      traceId,
      route,
      source,
      startTime: start,
      response,
      isImage: false,
    });

    return [
      {
        level: "CONNECTIVITY",
        result: ok ? "PASS" : "FAIL",
        latencyMs,
        errorMessage: ok ? null : "Empty response or no choices",
        responseBody: JSON.stringify(response).slice(0, 2000),
      },
    ];
  } catch (err) {
    const latencyMs = Date.now() - start;
    const message =
      err instanceof EngineError ? `${err.code}: ${err.message}` : (err as Error).message;
    const code = err instanceof EngineError ? err.code : undefined;
    writeProbeCallLog({
      traceId,
      route,
      source,
      startTime: start,
      error: { message, code },
      isImage: false,
    });
    return [
      {
        level: "CONNECTIVITY",
        result: "FAIL",
        latencyMs,
        errorMessage: message,
        responseBody: null,
      },
    ];
  }
}
