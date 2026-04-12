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

export interface CheckResult {
  level: HealthCheckLevel;
  result: HealthCheckResult;
  latencyMs: number;
  errorMessage: string | null;
  responseBody: string | null;
}

/**
 * 对一个通道执行全三级检查（文本通道）
 */
export async function runHealthCheck(route: RouteResult): Promise<CheckResult[]> {
  return runTextCheck(route);
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
// 文本通道检查（三级）
// ============================================================

async function runTextCheck(route: RouteResult): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const adapter = getAdapterForRoute(route);

  const start = Date.now();

  // --- Level 1: 连通性 ---
  try {
    const response = await adapter.chatCompletions(
      {
        model: route.model.name,
        messages: [{ role: "user", content: "请回答1+1等于几，只回答数字" }],
        max_tokens: 200,
        temperature: 0.01,
      },
      route,
    );

    const latencyMs = Date.now() - start;

    // L1: HTTP 200 + 响应非空
    if (!response || !response.choices?.length) {
      results.push({
        level: "CONNECTIVITY",
        result: "FAIL",
        latencyMs,
        errorMessage: "Empty response or no choices",
        responseBody: JSON.stringify(response).slice(0, 2000),
      });
      return results;
    }

    results.push({
      level: "CONNECTIVITY",
      result: "PASS",
      latencyMs,
      errorMessage: null,
      responseBody: JSON.stringify(response).slice(0, 2000),
    });

    // --- Level 2: 格式一致性 ---
    const content = response.choices[0]?.message?.content;
    const usage = response.usage;
    const finishReason = response.choices[0]?.finish_reason;

    const l2Errors: string[] = [];
    if (!content && content !== "") l2Errors.push("missing choices[0].message.content");
    if (!usage) l2Errors.push("missing usage");
    if (usage && !usage.prompt_tokens && usage.prompt_tokens !== 0)
      l2Errors.push("incomplete usage");
    if (!finishReason) l2Errors.push("missing finish_reason");

    if (l2Errors.length > 0) {
      results.push({
        level: "FORMAT",
        result: "FAIL",
        latencyMs,
        errorMessage: l2Errors.join("; "),
        responseBody: null,
      });
      return results;
    }

    results.push({
      level: "FORMAT",
      result: "PASS",
      latencyMs,
      errorMessage: null,
      responseBody: null,
    });

    // --- Level 3: 响应质量（非空且合理长度） ---
    const trimmed = (content ?? "").trim();
    const qualityPass = trimmed.length >= 1;
    results.push({
      level: "QUALITY",
      result: qualityPass ? "PASS" : "FAIL",
      latencyMs,
      errorMessage: qualityPass ? null : "Response content is empty or whitespace-only",
      responseBody: null,
    });

    return results;
  } catch (err) {
    const latencyMs = Date.now() - start;
    const message =
      err instanceof EngineError ? `${err.code}: ${err.message}` : (err as Error).message;

    results.push({
      level: "CONNECTIVITY",
      result: "FAIL",
      latencyMs,
      errorMessage: message,
      responseBody: null,
    });
    return results;
  }
}
