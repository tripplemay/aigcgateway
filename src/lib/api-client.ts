"use client";

/**
 * Error thrown by apiFetch on a non-2xx response.
 *
 * BL-SEC-HOTFIX-2608 F-SH-02: carries `status` and the API's machine-readable
 * `code` so callers can branch on the failure kind (e.g. render a localized
 * message for `payment_disabled`) instead of string-matching `message`.
 * Existing callers that only read `.message` are unaffected.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      body.error?.message ?? `Request failed: ${res.status}`,
      res.status,
      body.error?.code,
    );
  }

  return res.json();
}
