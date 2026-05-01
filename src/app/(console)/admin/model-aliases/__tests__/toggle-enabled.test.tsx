/**
 * BL-ADMIN-ALIAS-UX-PHASE1 F-AAU-03 — toggleEnabled optimistic + race
 *
 * Mirrors the handler closure inside page.tsx (mutate functional updater
 * + apiFetch + race-protected rollback) so the three scenarios required
 * by the spec can be tested without rendering the full ModelAliases page:
 *
 *   1. happy   — fetch resolved → state has enabled=true; no rollback
 *   2. failure — fetch rejected → state rolled back to prev snapshot
 *   3. race    — two concurrent toggles, the first one rejects after
 *                the second succeeds → second value preserved (no clobber)
 *
 * The test uses the real useAsyncData hook (renderHook) so the race
 * predicate (isAliasEnabledStillTarget) and mutate functional updater
 * paths are exercised exactly as the page would.
 */
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useAsyncData } from "@/hooks/use-async-data";
import { applyToggleEnabled, isAliasEnabledStillTarget } from "../_helpers";
import type { AliasItem, ApiResponse } from "../_types";

const fixture = (enabled: boolean): ApiResponse => ({
  data: [
    {
      id: "a1",
      alias: "alias-a1",
      brand: null,
      modality: "TEXT",
      enabled,
      contextWindow: null,
      maxTokens: null,
      capabilities: null,
      description: null,
      sellPrice: null,
      openRouterModelId: null,
      linkedModels: [],
      linkedModelCount: 0,
      activeChannelCount: 0,
    } as AliasItem,
  ],
  unlinkedModels: [],
  availableBrands: [],
  pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
});

/**
 * Mirrors the page.tsx toggleEnabled handler. Kept in-test rather than
 * extracted from page.tsx so a future refactor of the handler closure
 * still has a regression test pinning the *intended* contract.
 */
function makeToggleEnabledHandler(opts: {
  getApiData: () => ApiResponse | null;
  mutate: (updater?: ApiResponse | null | ((prev: ApiResponse | null) => ApiResponse | null)) => void;
  apiPatch: (id: string, enabled: boolean) => Promise<unknown>;
  onError: (msg: string) => void;
}) {
  return async (id: string, enabled: boolean) => {
    const prev = opts.getApiData();
    opts.mutate((cur) => applyToggleEnabled(cur, id, enabled));
    try {
      await opts.apiPatch(id, enabled);
    } catch (err) {
      opts.mutate((cur) => (isAliasEnabledStillTarget(cur, id, enabled) ? prev : cur));
      opts.onError((err as Error).message);
    }
  };
}

describe("toggleEnabled handler (F-AAU-03)", () => {
  it("happy: server resolves → state shows new enabled value, no rollback", async () => {
    const fetcher = vi.fn().mockResolvedValue(fixture(false));
    const { result } = renderHook(() => useAsyncData<ApiResponse>(fetcher));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const apiPatch = vi.fn().mockResolvedValue({});
    const onError = vi.fn();
    const toggle = makeToggleEnabledHandler({
      getApiData: () => result.current.data,
      mutate: (...args) => result.current.mutate(...args),
      apiPatch,
      onError,
    });

    await act(async () => {
      await toggle("a1", true);
    });

    expect(result.current.data?.data[0].enabled).toBe(true);
    expect(apiPatch).toHaveBeenCalledWith("a1", true);
    expect(onError).not.toHaveBeenCalled();
    // No refetch triggered — fetcher only called once at mount
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("failure: server rejects → state rolled back to the previous snapshot", async () => {
    const fetcher = vi.fn().mockResolvedValue(fixture(false));
    const { result } = renderHook(() => useAsyncData<ApiResponse>(fetcher));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const apiPatch = vi.fn().mockRejectedValue(new Error("HTTP 500"));
    const onError = vi.fn();
    const toggle = makeToggleEnabledHandler({
      getApiData: () => result.current.data,
      mutate: (...args) => result.current.mutate(...args),
      apiPatch,
      onError,
    });

    await act(async () => {
      await toggle("a1", true);
    });

    // Rolled back: enabled is back to false (prev snapshot)
    expect(result.current.data?.data[0].enabled).toBe(false);
    expect(onError).toHaveBeenCalledWith("HTTP 500");
  });

  it("race: 1st toggle rejects after 2nd resolves → 2nd's value is preserved (no clobber)", async () => {
    const fetcher = vi.fn().mockResolvedValue(fixture(false));
    const { result } = renderHook(() => useAsyncData<ApiResponse>(fetcher));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // First call's PATCH rejects (slow), second call's PATCH resolves (fast)
    let firstReject: ((err: Error) => void) | null = null;
    const apiPatch = vi.fn(
      (_id: string, enabled: boolean): Promise<unknown> => {
        if (enabled) {
          // 1st call: enabled=true (slow, will reject)
          return new Promise((_resolve, reject) => {
            firstReject = reject;
          });
        }
        // 2nd call: enabled=false (immediate resolve)
        return Promise.resolve({});
      },
    );
    const onError = vi.fn();
    const toggle = makeToggleEnabledHandler({
      getApiData: () => result.current.data,
      mutate: (...args) => result.current.mutate(...args),
      apiPatch,
      onError,
    });

    // Start both calls; 2nd should land its optimistic patch + resolve while 1st pends
    let firstPromise: Promise<void> | null = null;
    await act(async () => {
      firstPromise = toggle("a1", true); // optimistic: enabled=true
      await toggle("a1", false); // optimistic: enabled=false; resolves immediately
    });

    // After 2nd resolves, state shows enabled=false
    expect(result.current.data?.data[0].enabled).toBe(false);

    // Now reject the 1st call. Race predicate sees enabled=false (not the
    // value we tried to write, true) → must NOT roll back.
    await act(async () => {
      firstReject?.(new Error("HTTP 500"));
      await firstPromise!.catch(() => {
        /* expected */
      });
    });

    // State remains at enabled=false (the 2nd toggle's value), not clobbered
    expect(result.current.data?.data[0].enabled).toBe(false);
    expect(onError).toHaveBeenCalledWith("HTTP 500");
  });
});
