export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { errorResponse } from "@/lib/api/errors";
import { signJwt } from "@/lib/api/jwt-middleware";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "invalid_parameter", "Invalid JSON body");
  }

  const { email, password } = body;

  if (!email || !password) {
    return errorResponse(400, "invalid_parameter", "email and password are required");
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return errorResponse(401, "invalid_credentials", "Invalid email or password");
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return errorResponse(401, "invalid_credentials", "Invalid email or password");
  }

  if (user.deletedAt) {
    return errorResponse(403, "account_deleted", "User account has been deleted");
  }
  if (user.suspended) {
    return errorResponse(403, "account_suspended", "User account has been suspended");
  }

  // Rehash 存量 cost=12 的密码为 cost=10，降低后续登录延迟
  const currentRounds = bcrypt.getRounds(user.passwordHash);
  if (currentRounds !== 10) {
    const newHash = await bcrypt.hash(password, 10);
    prisma.user.update({ where: { id: user.id }, data: { passwordHash: newHash } }).catch(() => {});
  }

  const token = signJwt({ userId: user.id, role: user.role });

  // Write login history (async, non-blocking)
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null;
  const userAgent = request.headers.get("user-agent") || null;
  prisma.loginHistory
    .create({
      data: { userId: user.id, ip, userAgent },
    })
    .catch(() => {});

  return NextResponse.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  });
}
