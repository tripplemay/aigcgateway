import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Decode JWT payload without signature verification (Edge Runtime compatible). */
function decodeJwtPayload(token: string): { userId?: string; role?: string; exp?: number } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload;
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // /v1/* → rewrite to /api/v1/*
  if (pathname.startsWith("/v1/")) {
    const url = request.nextUrl.clone();
    url.pathname = `/api${pathname}`;
    return NextResponse.rewrite(url);
  }

  // /mcp → rewrite to /api/mcp
  if (pathname === "/mcp") {
    const url = request.nextUrl.clone();
    url.pathname = "/api/mcp";
    return NextResponse.rewrite(url);
  }

  // Console routes: require valid, non-expired JWT
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : request.cookies.get("token")?.value;

  if (!token) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  const payload = decodeJwtPayload(token);
  if (!payload || !payload.userId || !payload.exp) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  // Check JWT expiration
  if (payload.exp * 1000 < Date.now()) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  // Developer accessing /admin/* → redirect to /dashboard
  if (pathname.startsWith("/admin") && payload.role !== "ADMIN") {
    const dashUrl = request.nextUrl.clone();
    dashUrl.pathname = "/dashboard";
    return NextResponse.redirect(dashUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/v1/:path*",
    "/mcp",
    "/dashboard/:path*",
    "/keys/:path*",
    "/actions/:path*",
    "/templates/:path*",
    "/models/:path*",
    "/logs/:path*",
    "/usage/:path*",
    "/balance/:path*",
    "/quickstart/:path*",
    "/mcp-setup/:path*",
    "/settings/:path*",
    "/admin/:path*",
  ],
};
