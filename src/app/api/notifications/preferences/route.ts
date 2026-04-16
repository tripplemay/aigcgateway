export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { verifyJwt } from "@/lib/api/jwt-middleware";
import { errorResponse } from "@/lib/api/errors";
import { z } from "zod";

const preferenceUpdateSchema = z.object({
  eventType: z.enum([
    "BALANCE_LOW",
    "SPENDING_RATE_EXCEEDED",
    "CHANNEL_DOWN",
    "CHANNEL_RECOVERED",
    "PENDING_CLASSIFICATION",
  ]),
  channels: z.array(z.enum(["inApp", "webhook"])),
  enabled: z.boolean(),
  webhookUrl: z.string().url().nullable().optional(),
  webhookSecret: z.string().min(1).nullable().optional(),
});

const bulkUpdateSchema = z.array(preferenceUpdateSchema);

/** GET /api/notifications/preferences */
export async function GET(request: Request) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  const prefs = await prisma.notificationPreference.findMany({
    where: { userId: auth.payload.userId },
    orderBy: { eventType: "asc" },
    select: {
      id: true,
      eventType: true,
      channels: true,
      webhookUrl: true,
      webhookSecret: true,
      enabled: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ data: prefs });
}

/** PATCH /api/notifications/preferences — bulk upsert */
export async function PATCH(request: Request) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "invalid_json", "Request body must be valid JSON");
  }

  const parsed = bulkUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "validation_error", parsed.error.message);
  }

  const updates = parsed.data;
  await Promise.all(
    updates.map((u) =>
      prisma.notificationPreference.upsert({
        where: { userId_eventType: { userId: auth.payload.userId, eventType: u.eventType } },
        create: {
          userId: auth.payload.userId,
          eventType: u.eventType,
          channels: u.channels,
          enabled: u.enabled,
          webhookUrl: u.webhookUrl ?? null,
          webhookSecret: u.webhookSecret ?? null,
        },
        update: {
          channels: u.channels,
          enabled: u.enabled,
          ...(u.webhookUrl !== undefined ? { webhookUrl: u.webhookUrl } : {}),
          ...(u.webhookSecret !== undefined ? { webhookSecret: u.webhookSecret } : {}),
        },
      }),
    ),
  );

  return NextResponse.json({ success: true });
}
