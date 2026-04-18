import { jwtVerify } from "jose";
import type { UserRole } from "@prisma/client";

export interface VerifiedPayload {
  userId: string;
  role: UserRole;
  exp: number;
  iat?: number;
}

function getSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("JWT_SECRET is missing or too short (< 16 chars)");
  }
  return new TextEncoder().encode(secret);
}

export async function verifyJwt(token: string): Promise<VerifiedPayload> {
  if (!token) {
    throw new Error("empty token");
  }
  const { payload } = await jwtVerify(token, getSecretKey(), {
    algorithms: ["HS256"],
  });

  const userId = payload.userId;
  const role = payload.role;
  const exp = payload.exp;
  if (typeof userId !== "string" || !userId) {
    throw new Error("missing userId in jwt payload");
  }
  if (role !== "ADMIN" && role !== "DEVELOPER") {
    throw new Error("invalid role in jwt payload");
  }
  if (typeof exp !== "number") {
    throw new Error("missing exp in jwt payload");
  }
  return { userId, role, exp, iat: typeof payload.iat === "number" ? payload.iat : undefined };
}
