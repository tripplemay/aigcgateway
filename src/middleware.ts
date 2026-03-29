import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * 将 /v1/* 请求 rewrite 到 /api/v1/*
 * 这样 SDK 和开发者可以直接用 baseUrl + /v1/chat/completions
 * 无需关心 Next.js App Router 的 /api 前缀
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/v1/")) {
    const url = request.nextUrl.clone();
    url.pathname = `/api${pathname}`;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/v1/:path*",
};
