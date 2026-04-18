export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth/session-cookie";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
