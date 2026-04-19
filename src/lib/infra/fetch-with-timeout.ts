/**
 * BL-INFRA-RESILIENCE F-IR-01 — unified outbound fetch helpers.
 *
 * Rationale: every external fetch must carry a timeout + AbortController.
 * Dropped-connection or hung upstream with no signal is how we leaked sockets
 * in production (see H-21/23/24). Two shapes are provided:
 *
 *  1. `fetchWithTimeout(url, opts)` — non-streaming. Fetches the full Response
 *     with a deadline; timeout auto-clears when the call resolves/rejects. Use
 *     for dispatcher webhook, health alert, and any body-at-once request.
 *
 *  2. `fetchWithTimeoutStream(url, opts)` — streaming. Returns `{ response,
 *     clearTimeout }`; the caller is responsible for invoking `clearTimeout`
 *     once the body is fully consumed or cancelled. The timeout continues to
 *     guard body reads until then, which is the whole point — the previous
 *     code cleared the timer the moment headers returned, leaving body-hang
 *     scenarios unprotected.
 *
 * Both shapes wrap the native `fetch` and forward an AbortController signal.
 * Callers can still pass their own `signal` via `opts.signal`; both signals
 * are ANDed by nature of `AbortController.abort` aborting `fetch`.
 */

export interface FetchWithTimeoutOptions extends RequestInit {
  /** Timeout in ms. Default: 30_000. */
  timeoutMs?: number;
}

export interface FetchWithTimeoutStreamResult {
  response: Response;
  /** Caller must invoke this once body streaming ends or is cancelled. */
  clearTimeout: () => void;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/** Non-streaming: wait for full Response, timer auto-cleared. */
export async function fetchWithTimeout(
  url: string,
  options: FetchWithTimeoutOptions = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal: callerSignal, ...init } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  // If caller passed a signal, honour its abort.
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Streaming: returns Response + a `clearTimeout` the caller must invoke when
 * body consumption finishes (normal close or cancel). The timer continues
 * abort-arming `fetch`'s body reads until cleared.
 */
export async function fetchWithTimeoutStream(
  url: string,
  options: FetchWithTimeoutOptions = {},
): Promise<FetchWithTimeoutStreamResult> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal: callerSignal, ...init } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  let cleared = false;
  const clear = () => {
    if (cleared) return;
    cleared = true;
    clearTimeout(timeoutId);
  };
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return { response, clearTimeout: clear };
  } catch (err) {
    clear();
    throw err;
  }
}
