/**
 * JWT 中间件 — 控制台 API 鉴权
 *
 * 从 Authorization: Bearer <JWT> 提取 token → 验证签名 → 返回 { userId, role }
 */

import jwt, { type SignOptions } from "jsonwebtoken";
import type { UserRole } from "@prisma/client";
import { errorResponse } from "./errors";
import type { NextResponse } from "next/server";

const JWT_SECRET = process.env.JWT_SECRET ?? "";

export interface JwtPayload {
  userId: string;
  role: UserRole;
}

type JwtResult =
  | { ok: true; payload: JwtPayload }
  | { ok: false; error: NextResponse };

export function signJwt(payload: JwtPayload): string {
  const options: SignOptions = { expiresIn: (process.env.JWT_EXPIRES_IN ?? "7d") as string & SignOptions["expiresIn"] };
  return jwt.sign(payload, JWT_SECRET, options);
}

export function verifyJwt(request: Request): JwtResult {
  const authHeader = request.headers.get("authorization");

  if (!authHeader) {
    return {
      ok: false,
      error: errorResponse(401, "unauthorized", "Missing Authorization header"),
    };
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer" || !parts[1]) {
    return {
      ok: false,
      error: errorResponse(401, "unauthorized", "Invalid Authorization format"),
    };
  }

  try {
    const decoded = jwt.verify(parts[1], JWT_SECRET) as JwtPayload;
    return { ok: true, payload: decoded };
  } catch {
    return {
      ok: false,
      error: errorResponse(401, "unauthorized", "Invalid or expired token"),
    };
  }
}

export function requireRole(
  payload: JwtPayload,
  role: UserRole,
): NextResponse | null {
  if (payload.role !== role) {
    return errorResponse(403, "forbidden", `Requires ${role} role`);
  }
  return null;
}
