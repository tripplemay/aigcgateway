/**
 * BL-INFRA-RESILIENCE F-IR-01 — fetchWithTimeout / fetchWithTimeoutStream.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchWithTimeout, fetchWithTimeoutStream } from "../fetch-with-timeout";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe("fetchWithTimeout (non-streaming)", () => {
  it("returns the Response when upstream resolves within the deadline", async () => {
    globalThis.fetch = vi.fn(async () => new Response("ok", { status: 200 })) as unknown as typeof fetch;
    const res = await fetchWithTimeout("https://example.test/ok", { timeoutMs: 100 });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });

  it("aborts with AbortError when upstream exceeds timeoutMs", async () => {
    globalThis.fetch = vi.fn((_url, init) => {
      return new Promise<Response>((_resolve, reject) => {
        (init as RequestInit).signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted", "AbortError"));
        });
      });
    }) as unknown as typeof fetch;

    await expect(
      fetchWithTimeout("https://example.test/hang", { timeoutMs: 20 }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("clears the timer even when the call fails early", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("connection refused");
    }) as unknown as typeof fetch;
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    await expect(fetchWithTimeout("https://x", { timeoutMs: 100 })).rejects.toThrow(
      "connection refused",
    );
    expect(clearSpy).toHaveBeenCalled();
  });

  it("respects a caller-supplied AbortSignal (already aborted)", async () => {
    globalThis.fetch = vi.fn((_url, init) => {
      return new Promise<Response>((_resolve, reject) => {
        const s = (init as RequestInit).signal;
        if (s?.aborted) {
          reject(new DOMException("The operation was aborted", "AbortError"));
        }
      });
    }) as unknown as typeof fetch;

    const ac = new AbortController();
    ac.abort();
    await expect(
      fetchWithTimeout("https://x", { timeoutMs: 1000, signal: ac.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("fetchWithTimeoutStream (streaming)", () => {
  it("returns response + a clearTimeout callable the caller must invoke", async () => {
    globalThis.fetch = vi.fn(async () => new Response("streamed", { status: 200 })) as unknown as typeof fetch;
    const result = await fetchWithTimeoutStream("https://x", { timeoutMs: 100 });
    expect(result.response.status).toBe(200);
    expect(typeof result.clearTimeout).toBe("function");
    // idempotent: calling twice does not throw
    result.clearTimeout();
    result.clearTimeout();
  });

  it("clears the timer on fetch error before returning to caller", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    await expect(fetchWithTimeoutStream("https://x", { timeoutMs: 100 })).rejects.toThrow(
      "network down",
    );
    expect(clearSpy).toHaveBeenCalled();
  });
});
