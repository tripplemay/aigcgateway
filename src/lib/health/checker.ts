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
 * F-ACF-10 — minimal real-call probe. TEXT models call chat({max_tokens:1}),
 * IMAGE models call generate_image with the smallest supported size. Use the
 * result to drive auto-disable on three consecutive failures.
 */
export async function runCallProbe(
  route: RouteResult,
  source: ProbeSource = "probe",
): Promise<CheckResult> {
  const start = Date.now();
  const adapter = getAdapterForRoute(route);
  const isImage = route.alias?.modality === "IMAGE" || route.model.modality === "IMAGE";
  const traceId = `${source}_${route.channel.id}_${start}`;
  try {
    if (isImage) {
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
    const res = await adapter.chatCompletions(
      {
        model: route.model.name,
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 1,
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
      isImage,
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

  try {
    const response = await adapter.chatCompletions(
      {
        model: route.model.name,
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 1,
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
