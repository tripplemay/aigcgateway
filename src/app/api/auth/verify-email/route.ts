import { PrismaClient } from "@prisma/client";
import { errorResponse } from "@/lib/api/errors";
import { NextResponse } from "next/server";

const prisma = new PrismaClient();

/**
 * POST /api/auth/verify-email
 *
 * P1 简化实现：通过 userId 直接验证（生产环境应使用令牌）
 */
export async function POST(request: Request) {
  let body: { userId?: string; token?: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "invalid_parameter", "Invalid JSON body");
  }

  const { userId, token } = body;

  if (!userId && !token) {
    return errorResponse(400, "invalid_parameter", "userId or token is required");
  }

  // P1: 通过 userId 直接标记（P2 实现真正的邮件令牌验证）
  const identifier = userId ?? token;

  const user = await prisma.user.findFirst({
    where: { id: identifier },
  });

  if (!user) {
    return errorResponse(404, "not_found", "User not found");
  }

  if (user.emailVerified) {
    return NextResponse.json({ message: "Email already verified" });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true },
  });

  return NextResponse.json({ message: "Email verified successfully" });
}
