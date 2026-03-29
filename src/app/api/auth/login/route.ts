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

  const token = signJwt({ userId: user.id, role: user.role });

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
