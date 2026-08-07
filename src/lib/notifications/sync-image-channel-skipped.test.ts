/**
 * BL-IMG-GUANGTECH-CHANNEL F-GTI-02 — 跳过 IMAGE channel 的告警去重语义。
 *
 * 背景：sync 按 F-SI-01 主动跳过 IMAGE channel 创建（DB 触发器禁止 costPrice 全零
 * 的 IMAGE channel，sync 拿不到真实图片单价），留待人工补。原实现只 console.log，
 * guangtech 的 gpt-image-1 / -1.5 / -2 因此静默不可用一个月。
 *
 * 这里锁住的是**去重的粒度**：跳过是持续状态（模型一直在、channel 一直没人补），
 * 若按 provider 去重则 24h 后原样重播成噪音；若不去重则每次定时 sync 都轰炸。
 * 因此按「跳过集合」去重 —— 同一批模型持续被跳过时保持安静，一旦出现**新的**
 * IMAGE 模型立刻重新告警，正好对应唯一值得打扰管理员的时刻。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

/** 够用的内存版 Redis：只实现 SET NX EX / DEL / 读键（同 dedup-delivery.test.ts） */
class FakeRedis {
  store = new Map<string, { value: string; ttl: number }>();

  async set(key: string, value: string, _ex: string, ttl: number, mode?: string) {
    if (mode === "NX" && this.store.has(key)) return null;
    this.store.set(key, { value, ttl });
    return "OK";
  }

  async del(key: string) {
    return this.store.delete(key) ? 1 : 0;
  }

  keys() {
    return [...this.store.keys()];
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

import { sendSyncImageChannelSkippedToAdmins } from "./triggers";

const GUANGTECH_SET = [
  "guangtech/gpt-image-2 → guangtech/gpt-image-2",
  "guangtech/gpt-image-1 → guangtech/gpt-image-1",
  "guangtech/gpt-image-1.5 → guangtech/gpt-image-1.5",
];

beforeEach(() => {
  fakeRedis.store.clear();
  sendNotification.mockReset().mockResolvedValue(true);
  findManyUsers.mockReset().mockResolvedValue([{ id: "admin-1" }, { id: "admin-2" }]);
});

describe("F-GTI-02 — 跳过 IMAGE channel 必须告警", () => {
  it("有跳过项时向全部管理员投递", async () => {
    await sendSyncImageChannelSkippedToAdmins({ entries: GUANGTECH_SET });

    expect(sendNotification).toHaveBeenCalledTimes(2);
    const [, eventType, payload] = sendNotification.mock.calls[0];
    expect(eventType).toBe("SYNC_IMAGE_CHANNEL_SKIPPED");
    expect(payload).toMatchObject({ count: 3, truncated: false });
    expect(payload.entries).toHaveLength(3);
  });

  it("没有跳过项时一条都不发，也不占去重键", async () => {
    await sendSyncImageChannelSkippedToAdmins({ entries: [] });

    expect(sendNotification).not.toHaveBeenCalled();
    expect(fakeRedis.keys()).toHaveLength(0);
  });

  it("payload 只带前 20 条并标记 truncated（避免 payload 膨胀）", async () => {
    const many = Array.from({ length: 25 }, (_, i) => `p/model-${i} → p/model-${i}`);

    await sendSyncImageChannelSkippedToAdmins({ entries: many });

    const payload = sendNotification.mock.calls[0][2];
    expect(payload.count).toBe(25);
    expect(payload.entries).toHaveLength(20);
    expect(payload.truncated).toBe(true);
  });
});

describe("F-GTI-02 — 去重按「跳过集合」而非按次数", () => {
  it("同一集合连续两次 sync 不重复轰炸", async () => {
    await sendSyncImageChannelSkippedToAdmins({ entries: GUANGTECH_SET });
    await sendSyncImageChannelSkippedToAdmins({ entries: GUANGTECH_SET });

    expect(sendNotification).toHaveBeenCalledTimes(2); // 只有第一轮的两个管理员
  });

  it("集合顺序变化仍视为同一集合（key 按排序后内容算）", async () => {
    await sendSyncImageChannelSkippedToAdmins({ entries: GUANGTECH_SET });
    await sendSyncImageChannelSkippedToAdmins({ entries: [...GUANGTECH_SET].reverse() });

    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(fakeRedis.keys()).toHaveLength(1);
  });

  it("出现新的 IMAGE 模型（集合变化）立即重新告警 —— 这是本修复的核心", async () => {
    await sendSyncImageChannelSkippedToAdmins({ entries: GUANGTECH_SET });
    expect(sendNotification).toHaveBeenCalledTimes(2);

    await sendSyncImageChannelSkippedToAdmins({
      entries: [...GUANGTECH_SET, "openai/gpt-image-3 → openai/gpt-image-3"],
    });

    expect(sendNotification).toHaveBeenCalledTimes(4); // 又推了一轮
    expect(fakeRedis.keys()).toHaveLength(2); // 两个不同集合各占一个键
  });

  it("一条都没投递成功时释放去重键（沿用 DSV4-DEF-01 语义）", async () => {
    sendNotification.mockResolvedValue(false); // 管理员无偏好行 → 静默丢弃

    await sendSyncImageChannelSkippedToAdmins({ entries: GUANGTECH_SET });

    expect(fakeRedis.keys()).toHaveLength(0); // 键已释放，回填偏好后还能再告警
  });
});
