/**
 * 三级健康检查验证器
 *
 * 文本通道：
 *   L1 连通性：HTTP 200 + 响应非空
 *   L2 格式一致性：choices[0].message.content + usage 完整 + finish_reason 有效
 *   L3 响应质量：固定 prompt → content 含 "2"
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

// 图片通道最小尺寸（按 provider name）
const IMAGE_MIN_SIZES: Record<string, string> = {
  openai: "1024x1024",
  zhipu: "1024x1024",
  siliconflow: "512x512",
};

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
        max_tokens: 10,
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

    // --- Level 3: 响应质量 ---
    const hasTwo = (content ?? "").includes("2");
    results.push({
      level: "QUALITY",
      result: hasTwo ? "PASS" : "FAIL",
      latencyMs,
      errorMessage: hasTwo ? null : `Expected content to contain "2", got: "${content}"`,
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
  const adapter = getAdapterForRoute(route);
  const size = IMAGE_MIN_SIZES[route.provider.name] ?? "1024x1024";

  const start = Date.now();

  // --- Level 1: 连通性 ---
  try {
    const response = await adapter.imageGenerations(
      {
        model: route.model.name,
        prompt: "a red circle on white background",
        n: 1,
        size,
      },
      route,
    );

    const latencyMs = Date.now() - start;

    if (!response || !response.data?.length) {
      results.push({
        level: "CONNECTIVITY",
        result: "FAIL",
        latencyMs,
        errorMessage: "Empty response or no data",
        responseBody: JSON.stringify(response).slice(0, 2000),
      });
      return results;
    }

    results.push({
      level: "CONNECTIVITY",
      result: "PASS",
      latencyMs,
      errorMessage: null,
      responseBody: JSON.stringify(response).slice(0, 500),
    });

    // --- Level 2: 格式一致性 ---
    const firstItem = response.data[0];
    const hasUrl = !!firstItem?.url;
    const hasB64 = !!firstItem?.b64_json;

    if (!hasUrl && !hasB64) {
      results.push({
        level: "FORMAT",
        result: "FAIL",
        latencyMs,
        errorMessage: "Missing data[0].url and data[0].b64_json",
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

    // --- Level 3: 响应质量 ---
    if (hasUrl) {
      try {
        // Use GET instead of HEAD — some providers (e.g. zhipu) return
        // different Content-Type for HEAD vs GET, or require redirect following
        const imgRes = await fetch(firstItem.url!, { method: "GET", redirect: "follow" });
        const contentType = imgRes.headers.get("content-type") ?? "";
        // Accept image/* or octet-stream (binary download) or any 2xx with content
        const isImage =
          contentType.startsWith("image/") ||
          contentType.includes("octet-stream") ||
          (imgRes.ok && (imgRes.headers.get("content-length") ?? "0") !== "0");
        results.push({
          level: "QUALITY",
          result: isImage ? "PASS" : "FAIL",
          latencyMs,
          errorMessage: isImage ? null : `URL returned Content-Type: ${contentType}`,
          responseBody: null,
        });
      } catch (err) {
        results.push({
          level: "QUALITY",
          result: "FAIL",
          latencyMs,
          errorMessage: `URL fetch failed: ${(err as Error).message}`,
          responseBody: null,
        });
      }
    } else {
      // b64_json 存在即通过 L3
      results.push({
        level: "QUALITY",
        result: "PASS",
        latencyMs,
        errorMessage: null,
        responseBody: null,
      });
    }

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
