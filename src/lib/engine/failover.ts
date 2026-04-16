/**
 * Request-level channel failover.
 *
 * When the primary channel returns a retryable error (model_not_found,
 * provider_error, timeout, 5xx), automatically try the next candidate
 * channel. Deterministic errors (400, 402, 429) are NOT retried — switching
 * channels won't help.
 *
 * Max retries = min(candidates.length - 1, 3).
 */

import type { RouteResult } from "./types";
import { EngineError, ErrorCodes } from "./types";
import { getAdapterForRoute } from "./router";

const MAX_FAILOVER_RETRIES = 3;

/** Error codes that should NOT trigger failover (deterministic failures). */
const NON_RETRYABLE_CODES: Set<string> = new Set([
  ErrorCodes.AUTH_FAILED, // 401
  ErrorCodes.INSUFFICIENT_BALANCE, // 402
  ErrorCodes.RATE_LIMITED, // 429
  ErrorCodes.CONTENT_FILTERED, // content policy
]);

function isRetryable(err: unknown): boolean {
  if (err instanceof EngineError) {
    if (NON_RETRYABLE_CODES.has(err.code)) return false;
    // model_not_found, provider_error, timeout, channel_unavailable → retryable
    return true;
  }
  // Generic network errors, timeouts → retryable
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes("timeout") || msg.includes("econnrefused") || msg.includes("fetch failed")) {
      return true;
    }
  }
  return false;
}

/**
 * Execute a function with channel failover.
 *
 * @param candidates - Sorted channel list from routeByAlias
 * @param fn - The actual call to make (receives route + adapter)
 * @returns The result from the first successful call
 * @throws The last error if all candidates fail
 */
export async function withFailover<T>(
  candidates: RouteResult[],
  fn: (route: RouteResult, adapter: ReturnType<typeof getAdapterForRoute>) => Promise<T>,
  onRetry?: (attempt: number, failedRoute: RouteResult, error: unknown) => void,
): Promise<{ result: T; route: RouteResult; attempts: number }> {
  const maxAttempts = Math.min(candidates.length, MAX_FAILOVER_RETRIES + 1);
  let lastError: unknown;

  for (let i = 0; i < maxAttempts; i++) {
    const route = candidates[i];
    const adapter = getAdapterForRoute(route);

    try {
      const result = await fn(route, adapter);
      return { result, route, attempts: i + 1 };
    } catch (err) {
      lastError = err;

      if (!isRetryable(err) || i === maxAttempts - 1) {
        throw err;
      }

      // Log and try next candidate
      const channelDesc = `${route.provider.name}/${route.model.name}`;
      console.warn(
        `[failover] Attempt ${i + 1} failed on ${channelDesc}: ${err instanceof Error ? err.message : String(err)}. Trying next channel...`,
      );

      if (onRetry) {
        onRetry(i + 1, route, err);
      }
    }
  }

  // Should not reach here, but just in case
  throw lastError;
}
