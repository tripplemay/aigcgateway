export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { verifyJwt } from "@/lib/api/jwt-middleware";
import { errorResponse } from "@/lib/api/errors";

export async function POST(request: Request) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  const body = await request.json();
  const { oldPassword, newPassword } = body;

  if (!oldPassword || !newPassword) {
    return errorResponse(400, "invalid_parameter", "oldPassword and newPassword are required");
  }
  if (newPassword.length < 8) {
    return errorResponse(422, "invalid_parameter", "New password must be at least 8 characters", {
      param: "newPassword",
    });
  }

  const user = await prisma.user.findUnique({ where: { id: auth.payload.userId } });
  if (!user) return errorResponse(404, "not_found", "User not found");

  const valid = await bcrypt.compare(oldPassword, user.passwordHash);
  if (!valid) {
    return errorResponse(401, "invalid_credentials", "Current password is incorrect");
  }

  const newHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: auth.payload.userId },
    data: { passwordHash: newHash },
  });

  return NextResponse.json({ message: "Password changed successfully" });
}
