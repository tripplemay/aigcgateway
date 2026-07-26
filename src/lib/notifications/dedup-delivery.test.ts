/**
 * BL-DEEPSEEK-V4-HOTFIX fix_round 1 — DSV4-DEF-01 回归。
 *
 * Evaluator 复现的确定性竞态：
 *   容器启动 → initial sync 命中护栏 → `SET NX EX 86400` 占用去重键
 *   → 当时管理员还没有该事件的偏好行，dispatcher 静默丢弃，通知 0 条
 *   → 运维执行偏好回填
 *   → 再次触发同 provider/reason → 仍被 24h NX 键拦住 → 首个有效告警被吞
 *
 * 修复语义：去重窗口**从第一次成功投递开始计时**。抢键仍用 SET NX（并发风暴
 * 防护不能丢），但投递数为 0 时把键删掉。
 *
 * 这个形态原本在 4 个 trigger 里各写了一遍，现已收敛到公共 notifyDeduped。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

/** 够用的内存版 Redis：只实现 SET NX EX / DEL / 读键 */
class FakeRedis {
  store = new Map<string, { value: string; ttl: number }>();
  setCalls = 0;
  delCalls = 0;

  async set(key: string, value: string, _ex: string, ttl: number, mode?: string) {
    this.setCalls++;
    if (mode === "NX" && this.store.has(key)) return null;
    this.store.set(key, { value, ttl });
    return "OK";
  }

  async del(key: string) {
    this.delCalls++;
    return this.store.delete(key) ? 1 : 0;
  }

  has(key: string) {
    return this.store.has(key);
  }
}

const fakeRedis = new FakeRedis();
const sendNotification = vi.fn();
const findManyUsers = vi.fn();

vi.mock("@/lib/redis", () => ({ getRedis: () => fakeRedis }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findMany: (...a: unknown[]) => findManyUsers(...a) } },
}));
vi.mock("./dispatcher", () => ({
  sendNotification: (...a: unknown[]) => sendNotification(...a),
}));

import { sendSyncReconcileSkippedToAdmins, sendChannelDownToAdmins } from "./triggers";

const GUARD_EVENT = {
  providerName: "deepseek",
  reason: "shrink_guard" as const,
  remoteModelCount: 2,
  existingChannelCount: 5,
};
const DEDUP_KEY = "alert:sync_reconcile_skipped:deepseek:shrink_guard";

beforeEach(() => {
  fakeRedis.store.clear();
  fakeRedis.setCalls = 0;
  fakeRedis.delCalls = 0;
  sendNotification.mockReset();
  findManyUsers.mockReset().mockResolvedValue([{ id: "admin-1" }, { id: "admin-2" }]);
});

describe("DSV4-DEF-01 — 未实际投递的告警不得吃掉去重窗口", () => {
  it("回填前触发（无偏好 → 0 投递）不留下去重键", async () => {
    sendNotification.mockResolvedValue(false); // dispatcher: 无偏好行，静默丢弃

    await sendSyncReconcileSkippedToAdmins(GUARD_EVENT);

    expect(sendNotification).toHaveBeenCalledTimes(2); // 两个管理员都试过了
    expect(fakeRedis.has(DEDUP_KEY)).toBe(false); // 键已释放
  });

  it("回填后再次触发必须真的投递出去（缺陷的核心场景）", async () => {
    // 第一轮：启动时 initial sync，无偏好
    sendNotification.mockResolvedValue(false);
    await sendSyncReconcileSkippedToAdmins(GUARD_EVENT);

    // 运维执行 backfill-notification-preferences.ts --apply
    sendNotification.mockResolvedValue(true);

    // 第二轮：同 provider + 同 reason 再次触发
    await sendSyncReconcileSkippedToAdmins(GUARD_EVENT);

    // 旧实现在这里被 NX 键拦住，第二轮一条都不会发
    const secondRoundCalls = sendNotification.mock.calls.slice(2);
    expect(secondRoundCalls).toHaveLength(2);
    expect(fakeRedis.has(DEDUP_KEY)).toBe(true); // 这次才真正开始计时
  });

  it("投递成功后，窗口内重复触发仍被正常抑制（去重本身没被削弱）", async () => {
    sendNotification.mockResolvedValue(true);

    await sendSyncReconcileSkippedToAdmins(GUARD_EVENT);
    await sendSyncReconcileSkippedToAdmins(GUARD_EVENT);
    await sendSyncReconcileSkippedToAdmins(GUARD_EVENT);

    expect(sendNotification).toHaveBeenCalledTimes(2); // 只有第一轮的两个管理员
    expect(fakeRedis.has(DEDUP_KEY)).toBe(true);
  });

  it("部分投递成功也算数（一个管理员开了、一个关了）", async () => {
    sendNotification.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await sendSyncReconcileSkippedToAdmins(GUARD_EVENT);

    expect(fakeRedis.has(DEDUP_KEY)).toBe(true);
  });

  it("系统里没有管理员时不占用窗口", async () => {
    findManyUsers.mockResolvedValue([]);

    await sendSyncReconcileSkippedToAdmins(GUARD_EVENT);

    expect(sendNotification).not.toHaveBeenCalled();
    expect(fakeRedis.has(DEDUP_KEY)).toBe(false);
  });

  it("投递抛异常时释放窗口，不把故障期算进去重", async () => {
    sendNotification.mockRejectedValue(new Error("db down"));

    await sendSyncReconcileSkippedToAdmins(GUARD_EVENT);

    expect(fakeRedis.has(DEDUP_KEY)).toBe(false);
  });
});

describe("同一修复覆盖其余 trigger（原本 4 处各写一遍）", () => {
  it("CHANNEL_DOWN：0 投递不占 6h 窗口，投递成功才占", async () => {
    const params = {
      channelId: "ch-1",
      providerName: "deepseek",
      modelName: "deepseek-v3",
      lastError: null,
    };
    const key = "alert:channel_down:ch-1";

    sendNotification.mockResolvedValue(false);
    await sendChannelDownToAdmins(params);
    expect(fakeRedis.has(key)).toBe(false);

    sendNotification.mockResolvedValue(true);
    await sendChannelDownToAdmins(params);
    expect(fakeRedis.has(key)).toBe(true);
  });
});
