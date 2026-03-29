/**
 * Admin API 守卫 — 验证 JWT + 要求 ADMIN 角色
 */
import { verifyJwt, type JwtPayload } from "./jwt-middleware";
import { errorResponse } from "./errors";
import type { NextResponse } from "next/server";

type AdminResult =
  | { ok: true; payload: JwtPayload }
  | { ok: false; error: NextResponse };

export function requireAdmin(request: Request): AdminResult {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth;

  if (auth.payload.role !== "ADMIN") {
    return {
      ok: false,
      error: errorResponse(403, "forbidden", "Requires ADMIN role"),
    };
  }

  return { ok: true, payload: auth.payload };
}
