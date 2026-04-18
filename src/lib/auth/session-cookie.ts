import type { NextResponse } from "next/server";

export const SESSION_COOKIE_NAME = "token";
export const SESSION_COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

interface CookieAttrs {
  httpOnly: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
  secure: boolean;
}

function baseAttrs(): Omit<CookieAttrs, "maxAge"> {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  };
}

export function setSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    ...baseAttrs(),
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    ...baseAttrs(),
    maxAge: 0,
  });
}
