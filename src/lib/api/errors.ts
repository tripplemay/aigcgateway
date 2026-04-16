/**
 * 统一错误格式
 *
 * { error: { type, code, message, param?, balance? } }
 */

import { NextResponse } from "next/server";

export interface ApiErrorBody {
  type: string;
  code: string;
  message: string;
  param?: string;
  balance?: number;
  retryAfterSeconds?: number;
}

const ERROR_TYPE_MAP: Record<number, string> = {
  400: "invalid_request_error",
  401: "authentication_error",
  402: "billing_error",
  403: "permission_error",
  404: "not_found_error",
  409: "conflict_error",
  422: "invalid_request_error",
  429: "rate_limit_error",
  500: "server_error",
  502: "upstream_error",
  503: "service_unavailable_error",
};

export function errorResponse(
  status: number,
  code: string,
  message: string,
  extra?: {
    param?: string;
    balance?: number;
    retryAfterSeconds?: number;
    headers?: Record<string, string>;
  },
): NextResponse {
  const body: { error: ApiErrorBody } = {
    error: {
      type: ERROR_TYPE_MAP[status] ?? "server_error",
      code,
      message,
      ...(extra?.param ? { param: extra.param } : {}),
      ...(extra?.balance !== undefined ? { balance: extra.balance } : {}),
      ...(extra?.retryAfterSeconds !== undefined
        ? { retryAfterSeconds: extra.retryAfterSeconds }
        : {}),
    },
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(extra?.headers ?? {}),
  };

  return NextResponse.json(body, { status, headers });
}
