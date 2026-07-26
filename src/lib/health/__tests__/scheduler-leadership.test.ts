/**
 * BL-DEEPSEEK-V4-HOTFIX F-DSV4-02 — 调度器 leadership 恢复回归。
 *
 * 事故：leader lock 只在 instrumentation.ts 进程启动时抢一次，健康检查调度器
 * 心跳失败即 `stopScheduler()` 终局退出、无重抢路径。生产单副本在
 * 2026-07-23T05:15:31Z 打出 `lost scheduler leadership — stopping` 后，
 * 健康检查永久停摆（health_checks 表两天零写入），DeepSeek 直连通道模型下线
 * 也就没有被自动降级。
 *
 * 这些用例钉住修复后的语义，同时保住原有的多副本安全不变式：
 *   持锁 → 心跳成功 → 继续 probe
 *   持锁 → 心跳失败 → 待命（不 probe），记一条 WARN
 *   待命 → 抢锁失败 → 保持待命（不 probe），不重复写日志
 *   待命 → 抢锁成功 → 恢复 probe，记一条 INFO
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const heartbeatLock = vi.fn();
const acquireLeaderLock = vi.fn();
const writeSystemLog = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/infra/leader-lock", () => ({
  heartbeatLock: (...args: unknown[]) => heartbeatLock(...args),
  acquireLeaderLock: (...args: unknown[]) => acquireLeaderLock(...args),
  releaseLeaderLock: vi.fn(),
}));

vi.mock("@/lib/system-logger", () => ({
  writeSystemLog: (...args: unknown[]) => writeSystemLog(...args),
}));

import { ensureLeadership, __leadershipTesting } from "../scheduler";

beforeEach(() => {
  heartbeatLock.mockReset();
  acquireLeaderLock.mockReset();
  writeSystemLog.mockClear();
  __leadershipTesting.hasLeadership = false;
});

describe("ensureLeadership — 持锁路径", () => {
  it("心跳成功 → 保持持锁并放行 probe，不尝试抢锁", async () => {
    __leadershipTesting.hasLeadership = true;
    heartbeatLock.mockResolvedValue(true);

    await expect(ensureLeadership()).resolves.toBe(true);

    expect(heartbeatLock).toHaveBeenCalledTimes(1);
    expect(acquireLeaderLock).not.toHaveBeenCalled();
    expect(__leadershipTesting.hasLeadership).toBe(true);
    expect(writeSystemLog).not.toHaveBeenCalled();
  });

  it("心跳失败 → 转待命、拦住 probe，并写一条 WARN", async () => {
    __leadershipTesting.hasLeadership = true;
    heartbeatLock.mockResolvedValue(false);

    await expect(ensureLeadership()).resolves.toBe(false);

    expect(__leadershipTesting.hasLeadership).toBe(false);
    expect(writeSystemLog).toHaveBeenCalledTimes(1);
    expect(writeSystemLog.mock.calls[0][0]).toBe("HEALTH_CHECK");
    expect(writeSystemLog.mock.calls[0][1]).toBe("WARN");
  });

  it("心跳抛异常 → 按丢锁处理，不让异常冒泡打断 tick", async () => {
    __leadershipTesting.hasLeadership = true;
    heartbeatLock.mockRejectedValue(new Error("redis down"));

    await expect(ensureLeadership()).resolves.toBe(false);
    expect(__leadershipTesting.hasLeadership).toBe(false);
  });
});

describe("ensureLeadership — 待命重抢路径（本次事故的核心修复）", () => {
  it("待命中抢锁失败 → 保持待命且不 probe（别的副本持锁时不抢占）", async () => {
    acquireLeaderLock.mockResolvedValue(false);

    await expect(ensureLeadership()).resolves.toBe(false);

    expect(heartbeatLock).not.toHaveBeenCalled();
    expect(__leadershipTesting.hasLeadership).toBe(false);
    expect(writeSystemLog).not.toHaveBeenCalled();
  });

  it("待命中抢锁成功 → 恢复 probe，并写一条 INFO", async () => {
    acquireLeaderLock.mockResolvedValue(true);

    await expect(ensureLeadership()).resolves.toBe(true);

    expect(__leadershipTesting.hasLeadership).toBe(true);
    expect(writeSystemLog).toHaveBeenCalledTimes(1);
    expect(writeSystemLog.mock.calls[0][1]).toBe("INFO");
  });

  it("抢锁抛异常 → 保持待命，不冒泡", async () => {
    acquireLeaderLock.mockRejectedValue(new Error("redis down"));

    await expect(ensureLeadership()).resolves.toBe(false);
    expect(__leadershipTesting.hasLeadership).toBe(false);
  });

  it("丢锁 → 连续多轮抢不到 → 最终抢到：全程只写 2 条日志，且恢复后放行", async () => {
    __leadershipTesting.hasLeadership = true;
    heartbeatLock.mockResolvedValue(false);
    await ensureLeadership(); // 丢锁（WARN）

    acquireLeaderLock.mockResolvedValue(false);
    expect(await ensureLeadership()).toBe(false);
    expect(await ensureLeadership()).toBe(false);
    expect(await ensureLeadership()).toBe(false);

    acquireLeaderLock.mockResolvedValue(true);
    expect(await ensureLeadership()).toBe(true); // 重抢成功（INFO）

    // 关键回归：旧实现在这里已经 stopScheduler() 永久退出，永远到不了 true
    expect(__leadershipTesting.hasLeadership).toBe(true);
    expect(writeSystemLog).toHaveBeenCalledTimes(2);
    expect(writeSystemLog.mock.calls.map((c) => c[1])).toEqual(["WARN", "INFO"]);
  });

  it("恢复后再次心跳成功 → 稳定持锁，不会反复抢锁", async () => {
    acquireLeaderLock.mockResolvedValue(true);
    await ensureLeadership();
    acquireLeaderLock.mockClear();

    heartbeatLock.mockResolvedValue(true);
    expect(await ensureLeadership()).toBe(true);
    expect(await ensureLeadership()).toBe(true);

    expect(acquireLeaderLock).not.toHaveBeenCalled();
  });
});
