/**
 * Request-level channel failover (F-RR2-01 provider-aware, F-RR2-02 cooldown).
 *
 * When the primary channel fails, decide whether to retry against the next
 * candidate based on BOTH the error code and whether the next candidate lives
 * on a DIFFERENT provider:
 *
 *   - NEVER_RETRY codes — always surface to the caller. Deterministic errors
 *     that switching channels cannot fix (bad request params, content policy).
 *
 *   - CROSS_PROVIDER_ONLY codes — provider-scoped limits. Retry only if the
 *     next candidate belongs to a different provider, since a different
 *     provider has its own quota / key / balance pool. Two channels on the
 *     same provider share the same upstream limit, so retrying is pointless.
 *
 *   - Everything else (model_not_found, provider_error/5xx, timeout,
 *     channel_unavailable, generic network errors) — retry.
 *
 * Every retry also marks the failed channel for a 300 s cooldown (F-RR2-02)
 * so the next `routeByAlias` call de-prioritizes it. Cooldown write is
 * built in — callers don't need to pass onRetry themselves — guaranteeing
 * the three call sites (chat non-stream, chat stream, images) all behave
 * consistently.
 *
 * Max retries = min(candidates.length - 1, 3).
 */

import type { RouteResult } from "./types";
import { EngineError, ErrorCodes } from "./types";
import { getAdapterForRoute } from "./router";
import { markChannelCooldown } from "./cooldown";

const MAX_FAILOVER_RETRIES = 3;

/** Error codes that must never trigger failover (genuinely deterministic). */
const NEVER_RETRY: Set<string> = new Set([
  ErrorCodes.CONTENT_FILTERED,
  ErrorCodes.INVALID_REQUEST, // 400 — bad params, switching providers won't help
  ErrorCodes.INVALID_SIZE, // user-specified image size, not a provider quirk
]);

/**
 * Error codes that are provider-scoped. Retry only when the next candidate
 * lives on a DIFFERENT provider (independent quota / key / balance pool).
 */
const CROSS_PROVIDER_ONLY: Set<string> = new Set([
  ErrorCodes.AUTH_FAILED, // 401/403 — per-provider key
  ErrorCodes.INSUFFICIENT_BALANCE, // 402 — per-provider balance
  ErrorCodes.RATE_LIMITED, // 429 — per-provider quota
]);

function isRetryable(
  err: unknown,
  currentRoute: RouteResult,
  nextRoute: RouteResult | null,
): boolean {
  if (err instanceof EngineError) {
    if (NEVER_RETRY.has(err.code)) return false;
    if (CROSS_PROVIDER_ONLY.has(err.code)) {
      return nextRoute !== null && nextRoute.provider.id !== currentRoute.provider.id;
    }
    // model_not_found, provider_error, timeout, channel_unavailable, model_not_available
    return true;
  }
  // Generic network errors / timeouts — retryable
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes("timeout") || msg.includes("econnrefused") || msg.includes("fetch failed")) {
      return true;
    }
  }
  return false;
}

function cooldownReason(err: unknown): string {
  if (err instanceof EngineError) return err.code;
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes("timeout")) return "timeout";
    if (msg.includes("econnrefused")) return "econnrefused";
    if (msg.includes("fetch failed")) return "fetch_failed";
  }
  return "unknown";
}

/**
 * BL-BILLING-AUDIT-EXT-P1 F-BAX-04 — 每次 failover 尝试的可审计记录。
 * 按顺序记录 routed 到的 channel 与（如失败时）失败原因。成功落地那一条
 * 的 errorCode / errorMessage 为 undefined；全部失败时数组最后一条就是
 * 最终抛出给调用方的那个错误。写入 call_logs.responseSummary.attempt_chain，
 * 用于排查"channelId 与 errorMessage 错位"类问题。
 */
export interface AttemptRecord {
  channelId: string;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * F-BAX-04: 获取任意 Error 上挂载的 attempt chain（若是从 withFailover 抛出来的）。
 * 调用方在 catch 中读到 null 说明错误不是来自 withFailover（例如 resolveEngine 失败）。
 */
export function getAttemptChainFromError(err: unknown): AttemptRecord[] | null {
  if (err && typeof err === "object" && "attemptChain" in err) {
    const chain = (err as { attemptChain?: unknown }).attemptChain;
    if (Array.isArray(chain)) return chain as AttemptRecord[];
  }
  return null;
}

/**
 * Execute a function with channel failover.
 *
 * @param candidates - Sorted channel list from routeByAlias
 * @param fn - The actual call to make (receives route + adapter)
 * @param onRetry - Optional extra callback per retry. Cooldown is written
 *                  automatically regardless of whether a callback is supplied.
 * @returns The result from the first successful call plus the full attempt chain
 * @throws The last error if all candidates fail
 */
export async function withFailover<T>(
  candidates: RouteResult[],
  fn: (route: RouteResult, adapter: ReturnType<typeof getAdapterForRoute>) => Promise<T>,
  onRetry?: (attempt: number, failedRoute: RouteResult, error: unknown) => void,
): Promise<{
  result: T;
  route: RouteResult;
  attempts: number;
  attemptChain: AttemptRecord[];
}> {
  const maxAttempts = Math.min(candidates.length, MAX_FAILOVER_RETRIES + 1);
  const attemptChain: AttemptRecord[] = [];
  let lastError: unknown;

  for (let i = 0; i < maxAttempts; i++) {
    const route = candidates[i];
    const nextRoute = i + 1 < maxAttempts ? candidates[i + 1] : null;
    const adapter = getAdapterForRoute(route);

    try {
      const result = await fn(route, adapter);
      attemptChain.push({ channelId: route.channel.id });
      return { result, route, attempts: i + 1, attemptChain };
    } catch (err) {
      lastError = err;

      const code = err instanceof EngineError ? err.code : "network_error";
      const message = err instanceof Error ? err.message : String(err);
      attemptChain.push({
        channelId: route.channel.id,
        errorCode: code,
        errorMessage: message,
      });

      const retryable = isRetryable(err, route, nextRoute);
      if (!retryable || i === maxAttempts - 1) {
        // F-BAX-04: annotate error with attemptChain so caller's catch
        // can still write it into call_logs.responseSummary.attempt_chain.
        if (err && typeof err === "object") {
          (err as { attemptChain?: AttemptRecord[] }).attemptChain = attemptChain;
        }
        throw err;
      }

      // F-RR2-02: default cooldown write. Fire-and-forget so the
      // retry isn't blocked by Redis latency.
      void markChannelCooldown(route.channel.id, cooldownReason(err));

      const channelDesc = `${route.provider.name}/${route.model.name}`;
      console.warn(
        `[failover] Attempt ${i + 1} failed on ${channelDesc} (${code}): ${message}. Trying next channel...`,
      );

      if (onRetry) {
        onRetry(i + 1, route, err);
      }
    }
  }

  // Should not reach here, but just in case
  throw lastError;
}

// Exported for tests
export const __testing = { isRetryable, NEVER_RETRY, CROSS_PROVIDER_ONLY, cooldownReason };
