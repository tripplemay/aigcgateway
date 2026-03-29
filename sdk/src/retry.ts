import type { RetryConfig } from "./types/config";
import { mapResponseToError } from "./errors";

const DEFAULTS: Required<RetryConfig> = {
  maxRetries: 2,
  retryOn: [429, 500, 502, 503],
  initialDelay: 1000,
  backoffMultiplier: 2,
  maxDelay: 30000,
};

const NO_RETRY_STATUSES = new Set([400, 401, 402, 403, 404, 422]);

interface RetryOptions {
  config: RetryConfig;
  fetchFn: typeof fetch;
  url: string;
  init: RequestInit;
  requestModel?: string;
  isStream?: boolean;
}

export async function fetchWithRetry(opts: RetryOptions): Promise<Response> {
  const cfg = { ...DEFAULTS, ...opts.config };
  const retryOn = new Set(cfg.retryOn);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    try {
      const response = await opts.fetchFn(opts.url, opts.init);

      if (response.ok) return response;

      // Stream responses: check headers but don't consume body yet for SSE
      if (opts.isStream && response.ok) return response;

      // Non-retryable status
      if (NO_RETRY_STATUSES.has(response.status)) {
        const body = await response.json().catch(() => ({}));
        throw mapResponseToError(
          response.status,
          body as { error?: { code?: string; message?: string; param?: string; balance?: number } },
          response.headers,
          opts.requestModel,
        );
      }

      // Retryable status
      if (!retryOn.has(response.status) || attempt === cfg.maxRetries) {
        const body = await response.json().catch(() => ({}));
        throw mapResponseToError(
          response.status,
          body as { error?: { code?: string; message?: string; param?: string; balance?: number } },
          response.headers,
          opts.requestModel,
        );
      }

      // 429: prefer Retry-After header
      if (response.status === 429) {
        const retryAfter = response.headers.get("retry-after");
        if (retryAfter) {
          await sleep(Number(retryAfter) * 1000);
          continue;
        }
      }

      // Exponential backoff
      const delay = Math.min(
        cfg.initialDelay * Math.pow(cfg.backoffMultiplier, attempt),
        cfg.maxDelay,
      );
      await sleep(delay);
    } catch (err) {
      // Already a GatewayError → don't retry
      if ((err as { name?: string }).name?.includes("Error") && (err as { status?: number }).status) {
        throw err;
      }

      lastError = err as Error;

      // Stream: only retry before connection is established
      if (opts.isStream && attempt > 0) throw err;

      if (attempt === cfg.maxRetries) throw err;

      const delay = Math.min(
        cfg.initialDelay * Math.pow(cfg.backoffMultiplier, attempt),
        cfg.maxDelay,
      );
      await sleep(delay);
    }
  }

  throw lastError ?? new Error("Retry exhausted");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
