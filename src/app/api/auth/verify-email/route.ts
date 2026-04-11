export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/api/errors";
import { NextResponse } from "next/server";

/**
 * POST /api/auth/verify-email
 *
 * Verify email using a one-time token (generated at registration).
 * Token must be valid and not expired.
 */
export async function POST(request: Request) {
  let body: { token?: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "invalid_parameter", "Invalid JSON body");
  }

  const { token } = body;

  if (!token) {
    return errorResponse(400, "invalid_parameter", "token is required");
  }

  const record = await prisma.emailVerificationToken.findUnique({
    where: { token },
    include: { user: { select: { id: true, emailVerified: true } } },
  });

  if (!record) {
    return errorResponse(400, "invalid_token", "Invalid verification token");
  }

  if (record.used) {
    return errorResponse(400, "token_used", "This verification token has already been used");
  }

  if (record.expiresAt < new Date()) {
    return errorResponse(400, "token_expired", "Verification token has expired");
  }

  if (record.user.emailVerified) {
    return NextResponse.json({ message: "Email already verified" });
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { emailVerified: true },
    }),
    prisma.emailVerificationToken.update({
      where: { id: record.id },
      data: { used: true },
    }),
  ]);

  return NextResponse.json({ message: "Email verified successfully" });
}
