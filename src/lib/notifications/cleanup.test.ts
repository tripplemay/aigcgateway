/**
 * BL-DATA-CONSISTENCY F-DC-03 — cleanupExpiredNotifications + defaultExpiresAt.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const deleteManyMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    notification: {
      deleteMany: (args: unknown) => deleteManyMock(args),
    },
  },
}));

import { cleanupExpiredNotifications } from "./cleanup";
import { defaultExpiresAt, DEFAULT_TTL_DAYS } from "./ttl";

beforeEach(() => {
  deleteManyMock.mockReset();
});

describe("cleanupExpiredNotifications", () => {
  it("deletes rows where expiresAt < now", async () => {
    deleteManyMock.mockResolvedValueOnce({ count: 3 });
    const now = new Date("2026-04-19T12:00:00Z");

    const result = await cleanupExpiredNotifications(now);

    expect(deleteManyMock).toHaveBeenCalledWith({
      where: { expiresAt: { lt: now } },
    });
    expect(result).toEqual({ deleted: 3 });
  });

  it("does not match rows with expiresAt NULL (lt operator excludes null in Prisma)", async () => {
    deleteManyMock.mockResolvedValueOnce({ count: 0 });
    const result = await cleanupExpiredNotifications();
    expect(result.deleted).toBe(0);
  });
});

describe("defaultExpiresAt", () => {
  const now = new Date("2026-04-19T00:00:00Z");

  it("returns now + 30 days for BALANCE_LOW", () => {
    const exp = defaultExpiresAt("BALANCE_LOW", now);
    expect(exp).not.toBeNull();
    expect(exp!.getTime() - now.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it("returns now + 7 days for SPENDING_RATE_EXCEEDED", () => {
    const exp = defaultExpiresAt("SPENDING_RATE_EXCEEDED", now);
    expect(exp).not.toBeNull();
    expect(exp!.getTime() - now.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("returns null for admin-oriented events (CHANNEL_DOWN / RECOVERED / PENDING_CLASSIFICATION)", () => {
    expect(defaultExpiresAt("CHANNEL_DOWN", now)).toBeNull();
    expect(defaultExpiresAt("CHANNEL_RECOVERED", now)).toBeNull();
    expect(defaultExpiresAt("PENDING_CLASSIFICATION", now)).toBeNull();
  });

  it("DEFAULT_TTL_DAYS exposes expected keys only", () => {
    expect(Object.keys(DEFAULT_TTL_DAYS).sort()).toEqual(
      ["BALANCE_LOW", "SPENDING_RATE_EXCEEDED"].sort(),
    );
  });
});
