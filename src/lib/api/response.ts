/**
 * 响应工具函数
 *
 * 所有响应自动携带 X-Trace-Id / X-Request-Id Header
 */

import { NextResponse } from "next/server";
import { createId } from "@paralleldrive/cuid2";

export function generateTraceId(): string {
  return `trc_${createId()}`;
}

export function generateRequestId(): string {
  return `req_${createId()}`;
}

/**
 * 标准 JSON 响应，附加 traceId / requestId headers
 */
export function jsonResponse(
  data: unknown,
  status: number,
  traceId: string,
  extraHeaders?: Record<string, string>,
): NextResponse {
  const requestId = generateRequestId();
  return NextResponse.json(data, {
    status,
    headers: {
      "X-Trace-Id": traceId,
      "X-Request-Id": requestId,
      ...(extraHeaders ?? {}),
    },
  });
}

/**
 * SSE 流式响应
 */
export function sseResponse(
  stream: ReadableStream,
  traceId: string,
  extraHeaders?: Record<string, string>,
): Response {
  const requestId = generateRequestId();
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Trace-Id": traceId,
      "X-Request-Id": requestId,
      ...(extraHeaders ?? {}),
    },
  });
}
