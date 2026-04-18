import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyJwt } from "@/lib/auth/jwt";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/v1/")) {
    const url = request.nextUrl.clone();
    url.pathname = `/api${pathname}`;
    return NextResponse.rewrite(url);
  }

  if (pathname === "/mcp") {
    const url = request.nextUrl.clone();
    url.pathname = "/api/mcp";
    return NextResponse.rewrite(url);
  }

  const token = request.cookies.get("token")?.value;

  const redirectToLogin = () => {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = `?redirect=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(loginUrl);
  };

  if (!token) {
    return redirectToLogin();
  }

  let payload;
  try {
    payload = await verifyJwt(token);
  } catch {
    return redirectToLogin();
  }

  if (pathname.startsWith("/admin") && payload.role !== "ADMIN") {
    const dashUrl = request.nextUrl.clone();
    dashUrl.pathname = "/dashboard";
    dashUrl.search = "";
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
