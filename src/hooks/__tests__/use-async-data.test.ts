/**
 * BL-ADMIN-ALIAS-UX-PHASE1 F-AAU-02 — useAsyncData mutate contract.
 *
 * 6 cases pin the SWR-style mutate API:
 *   (a) initial fetch sets data
 *   (b) refetch re-invokes fetcher and replaces data
 *   (c) mutate(value) sets data synchronously without a network call
 *   (d) mutate(fn) receives prev and applies functional updater
 *   (e) mutate() with no argument is equivalent to refetch
 *   (f) refetch after mutate overwrites local patch with server value
 */
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useAsyncData } from "../use-async-data";

describe("useAsyncData", () => {
  it("initial fetch populates data and clears loading", async () => {
    const fetcher = vi.fn().mockResolvedValue({ x: 1 });
    const { result } = renderHook(() => useAsyncData<{ x: number }>(fetcher));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ x: 1 });
    expect(result.current.error).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("refetch re-invokes the fetcher and replaces data", async () => {
    const fetcher = vi.fn().mockResolvedValue({ x: 1 });
    const { result } = renderHook(() => useAsyncData<{ x: number }>(fetcher));

    await waitFor(() => expect(result.current.loading).toBe(false));
    fetcher.mockResolvedValueOnce({ x: 2 });
    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.data).toEqual({ x: 2 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("mutate(value) sets data synchronously without invoking fetcher", async () => {
    const fetcher = vi.fn().mockResolvedValue({ x: 1 });
    const { result } = renderHook(() => useAsyncData<{ x: number }>(fetcher));

    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      result.current.mutate({ x: 99 });
    });
    expect(result.current.data).toEqual({ x: 99 });
    // mutate(value) 不应触发 fetcher
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("mutate(fn) receives prev and applies the functional updater", async () => {
    const fetcher = vi.fn().mockResolvedValue({ x: 1 });
    const { result } = renderHook(() => useAsyncData<{ x: number }>(fetcher));

    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      result.current.mutate((prev) => (prev ? { x: prev.x + 10 } : prev));
    });
    expect(result.current.data).toEqual({ x: 11 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("mutate() with no argument is equivalent to refetch", async () => {
    const fetcher = vi.fn().mockResolvedValue({ x: 1 });
    const { result } = renderHook(() => useAsyncData<{ x: number }>(fetcher));

    await waitFor(() => expect(result.current.loading).toBe(false));
    fetcher.mockResolvedValueOnce({ x: 5 });
    await act(async () => {
      result.current.mutate();
    });
    await waitFor(() => expect(result.current.data).toEqual({ x: 5 }));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("refetch after mutate overwrites local patch with server value", async () => {
    const fetcher = vi.fn().mockResolvedValue({ x: 1 });
    const { result } = renderHook(() => useAsyncData<{ x: number }>(fetcher));

    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      result.current.mutate({ x: 99 });
    });
    expect(result.current.data).toEqual({ x: 99 });
    fetcher.mockResolvedValueOnce({ x: 2 });
    await act(async () => {
      await result.current.refetch();
    });
    expect(result.current.data).toEqual({ x: 2 });
  });
});
