/**
 * F-UA-01: default NotificationPreference rows seeded on user creation.
 *
 * Choice of defaults per spec:
 *   - BALANCE_LOW / SPENDING_RATE_EXCEEDED → inApp for every user. These
 *     relate to the caller's own money so they apply to both developers
 *     and admins out of the box.
 *   - CHANNEL_DOWN / CHANNEL_RECOVERED / PENDING_CLASSIFICATION → only
 *     ADMIN users receive them (inApp), because developers cannot act on
 *     provider health or review a classifier queue they do not own.
 *
 * Webhooks stay off by default. A user has to visit Settings and enable
 * them explicitly — this avoids accidentally POSTing to an unconfigured
 * URL.
 */
import type { NotificationEventType, Prisma, UserRole } from "@prisma/client";

// Accept any Prisma client surface that exposes
// notificationPreference.createMany — Prisma.TransactionClient and the
// extended singleton from @/lib/prisma otherwise refuse to unify.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TxLike = any;

export interface PrefSeed {
  eventType: NotificationEventType;
  channels: string[]; // e.g. ["inApp"] — webhook enabled later via Settings
  enabled: boolean;
}

const DEVELOPER_DEFAULTS: PrefSeed[] = [
  { eventType: "BALANCE_LOW", channels: ["inApp"], enabled: true },
  { eventType: "SPENDING_RATE_EXCEEDED", channels: ["inApp"], enabled: true },
  // The admin-scoped events exist as disabled rows so Settings can
  // always render every row without having to lazy-create.
  { eventType: "CHANNEL_DOWN", channels: ["inApp"], enabled: false },
  { eventType: "CHANNEL_RECOVERED", channels: ["inApp"], enabled: false },
  { eventType: "PENDING_CLASSIFICATION", channels: ["inApp"], enabled: false },
];

const ADMIN_DEFAULTS: PrefSeed[] = [
  { eventType: "BALANCE_LOW", channels: ["inApp"], enabled: true },
  { eventType: "SPENDING_RATE_EXCEEDED", channels: ["inApp"], enabled: true },
  { eventType: "CHANNEL_DOWN", channels: ["inApp"], enabled: true },
  { eventType: "CHANNEL_RECOVERED", channels: ["inApp"], enabled: true },
  { eventType: "PENDING_CLASSIFICATION", channels: ["inApp"], enabled: true },
];

export function defaultNotificationPreferences(role: UserRole): PrefSeed[] {
  return role === "ADMIN" ? ADMIN_DEFAULTS : DEVELOPER_DEFAULTS;
}

/**
 * Creates the default preference rows for a freshly-created user. Safe
 * to run inside a Prisma transaction — the caller passes the `tx`
 * client so the insert joins the same atomic registration.
 */
export async function seedDefaultNotificationPreferences(
  tx: TxLike,
  userId: string,
  role: UserRole,
): Promise<void> {
  const seeds = defaultNotificationPreferences(role);
  await tx.notificationPreference.createMany({
    data: seeds.map((s) => ({
      userId,
      eventType: s.eventType,
      channels: s.channels as unknown as Prisma.InputJsonValue,
      enabled: s.enabled,
    })),
    skipDuplicates: true,
  });
}
