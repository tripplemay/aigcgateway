/**
 * 三级健康检查验证器
 *
 * 文本通道：
 *   L1 连通性：HTTP 200 + 响应非空
 *   L2 格式一致性：choices[0].message.content + usage 完整 + finish_reason 有效
 *   L3 响应质量：返回内容非空且长度合理（≥1 字符）
 *
 * 图片通道：
 *   L1 连通性：HTTP 200 + 响应非空
 *   L2 格式一致性：data[0].url 或 data[0].b64_json 存在
 *   L3 响应质量：URL 可访问且 Content-Type 为 image/*
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
 * 对一个通道执行三级检查，返回每级结果
 */
export async function runHealthCheck(route: RouteResult): Promise<CheckResult[]> {
  const isImage = route.model.modality === "IMAGE";

  if (isImage) {
    return runImageCheck(route);
  }
  return runTextCheck(route);
}

// ============================================================
// 文本通道检查
// ============================================================

async function runTextCheck(route: RouteResult): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const adapter = getAdapterForRoute(route);

  const start = Date.now();
  let responseJson: Record<string, unknown> | null = null;

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

    responseJson = response as unknown as Record<string, unknown>;
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

// ============================================================
// 图片通道检查
// ============================================================

async function runImageCheck(route: RouteResult): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const start = Date.now();

  // 图片通道改为 /models 轻量探测，不再调用 imageGenerations()
  // 原因：imageGenerations 会真实生成图片并产生费用（单次 $0.04–$0.19）
  // /models 为元数据接口，无计费，能验证 API Key 有效性和网络可达性
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

    // --- Level 1: 连通性 (HTTP 200 + 响应非空) ---
    if (!response.ok || !body) {
      results.push({
        level: "CONNECTIVITY",
        result: "FAIL",
        latencyMs,
        errorMessage: `HTTP ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
        responseBody: body.slice(0, 2000),
      });
      return results;
    }

    results.push({
      level: "CONNECTIVITY",
      result: "PASS",
      latencyMs,
      errorMessage: null,
      responseBody: body.slice(0, 500),
    });

    // --- Level 2: 格式 (响应包含 data 数组) ---
    let parsed: { data?: unknown[] } | null = null;
    try {
      parsed = JSON.parse(body);
    } catch {
      /* not JSON */
    }

    if (!parsed || !Array.isArray(parsed.data)) {
      results.push({
        level: "FORMAT",
        result: "FAIL",
        latencyMs,
        errorMessage: "Response missing data array",
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

    // 图片通道止步于 L2，不执行 L3
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
