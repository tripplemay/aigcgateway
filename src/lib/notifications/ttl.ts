/**
 * BL-DATA-CONSISTENCY F-DC-03 — default TTL per NotificationEventType.
 *
 * 高频 transient 告警有保留上限（balance 30d / rate 7d），读完即过；
 * admin-oriented 事件（channel / classifier）保留 null = 不过期，用户决定
 * 何时手动清理。
 *
 * dispatcher 在 create notification 时用 `defaultExpiresAt(eventType)` 注入。
 * cleanup cron 每日一次扫 `expiresAt < now` 物理删除。
 */
import type { NotificationEventType } from "@prisma/client";

const DAY_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_TTL_DAYS: Partial<Record<NotificationEventType, number>> = {
  BALANCE_LOW: 30,
  SPENDING_RATE_EXCEEDED: 7,
  // CHANNEL_DOWN / CHANNEL_RECOVERED / PENDING_CLASSIFICATION / AUTH_ALERT
  // 留 null，由运维手动决定何时清理
};

export function defaultExpiresAt(
  eventType: NotificationEventType,
  now: Date = new Date(),
): Date | null {
  const days = DEFAULT_TTL_DAYS[eventType];
  if (days === undefined) return null;
  return new Date(now.getTime() + days * DAY_MS);
}
