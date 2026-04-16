export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { verifyJwt } from "@/lib/api/jwt-middleware";
import { errorResponse } from "@/lib/api/errors";
import { createHmac } from "node:crypto";

/** POST /api/notifications/test-webhook — send a test ping to the user's webhook URL */
export async function POST(request: Request) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  // Find any preference that has a webhookUrl configured for this user
  const pref = await prisma.notificationPreference.findFirst({
    where: {
      userId: auth.payload.userId,
      webhookUrl: { not: null },
    },
    select: { webhookUrl: true, webhookSecret: true },
  });

  if (!pref?.webhookUrl) {
    return errorResponse(400, "no_webhook_url", "No webhook URL configured for this account");
  }

  const body = JSON.stringify({
    event: "TEST",
    payload: { message: "AIGC Gateway webhook test ping" },
    timestamp: new Date().toISOString(),
  });

  const signature = pref.webhookSecret
    ? createHmac("sha256", pref.webhookSecret).update(body).digest("hex")
    : "";

  try {
    const res = await fetch(pref.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-AIGC-Signature": signature,
        "X-AIGC-Event": "TEST",
      },
      body,
    });

    if (!res.ok) {
      return NextResponse.json(
        { success: false, status: res.status, message: `Webhook returned HTTP ${res.status}` },
        { status: 200 },
      );
    }

    return NextResponse.json({ success: true, status: res.status });
  } catch (err) {
    return NextResponse.json(
      { success: false, message: (err as Error).message },
      { status: 200 },
    );
  }
}
