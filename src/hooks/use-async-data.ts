"use client";
import { useCallback, useEffect, useState } from "react";

interface UseAsyncDataResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  /**
   * BL-ADMIN-ALIAS-UX-PHASE1 F-AAU-02: SWR-style local mutation.
   *
   * - mutate(value)  → 直接 setData(value)，同步生效（optimistic patch）。
   *                     value 接受 T | null（rollback 到初始 null 也合法）
   * - mutate(fn)     → setData((prev) => fn(prev))，functional updater，
   *                     race-safe（基于最新 prev，不绑定调用时的旧值）
   * - mutate()       → 等价 refetch()，从 server 重拉权威数据
   *
   * 不会触发 loading=true（避免 optimistic 翻转时的 loading 闪屏）。
   * 现有消费方忽略 mutate 字段无影响。
   */
  mutate: (updater?: T | null | ((prev: T | null) => T | null)) => void;
}

/**
 * Generic async data fetching hook.
 *
 * @param fetcher - async function that returns data
 * @param deps - dependency array; refetches when deps change
 */
export function useAsyncData<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
): UseAsyncDataResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const execute = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    execute();
  }, [execute]);

  const mutate = useCallback(
    (updater?: T | null | ((prev: T | null) => T | null)) => {
      if (updater === undefined) {
        // mutate() 不传 → 等价 refetch（从 server 重拉权威数据）
        void execute();
        return;
      }
      if (typeof updater === "function") {
        // functional updater：基于最新 prev 计算，race-safe
        setData((prev) => (updater as (prev: T | null) => T | null)(prev));
      } else {
        // 直接赋值（含 null）
        setData(updater);
      }
    },
    [execute],
  );

  return { data, loading, error, refetch: execute, mutate };
}
