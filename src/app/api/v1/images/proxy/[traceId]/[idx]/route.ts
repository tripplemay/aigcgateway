export const dynamic = "force-dynamic";
/**
 * GET /v1/images/proxy/:traceId/:idx?exp=...&sig=...
 *
 * F-ACF-07: reverse-proxy for upstream image URLs. The upstream host is
 * resolved from CallLog.responseSummary.original_urls and never leaks to
 * the client. HMAC + exp gate every request.
 */

import { prisma } from "@/lib/prisma";
import { verifyProxySignature } from "@/lib/api/image-proxy";

interface Params {
  params: Promise<{ traceId: string; idx: string }>;
}

export async function GET(request: Request, { params }: Params) {
  const { traceId, idx: idxRaw } = await params;
  const idx = Number.parseInt(idxRaw, 10);
  if (!Number.isFinite(idx) || idx < 0) {
    return new Response("bad index", { status: 400 });
  }

  const url = new URL(request.url);
  const exp = Number.parseInt(url.searchParams.get("exp") ?? "", 10);
  const sig = url.searchParams.get("sig") ?? "";
  const verdict = verifyProxySignature(traceId, idx, exp, sig);
  if (!verdict.ok) {
    return new Response(verdict.reason, { status: 403 });
  }

  const log = await prisma.callLog.findUnique({
    where: { traceId },
    select: { responseSummary: true },
  });
  const summary = (log?.responseSummary ?? null) as { original_urls?: unknown } | null;
  const originalUrls = Array.isArray(summary?.original_urls) ? summary!.original_urls : [];
  const upstream = originalUrls[idx];
  if (typeof upstream !== "string" || !/^https?:\/\//i.test(upstream)) {
    return new Response("image not found", { status: 404 });
  }

  const upstreamRes = await fetch(upstream, { redirect: "follow" });
  if (!upstreamRes.ok || !upstreamRes.body) {
    return new Response("upstream fetch failed", { status: 502 });
  }

  const contentType = upstreamRes.headers.get("content-type") ?? "application/octet-stream";
  return new Response(upstreamRes.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=60",
    },
  });
}
