export const dynamic = "force-dynamic";
/**
 * GET /v1/images/proxy/:traceId/:idx?exp=...&sig=...
 *
 * F-ACF-07: reverse-proxy for image URLs. The source is resolved from
 * CallLog.responseSummary.original_urls and never leaks to the client.
 * HMAC + exp gate every request.
 *
 * BL-IMG-PERSIST-GCS F-IGP-03: original_urls[idx] is now normally a GCS object
 * key (D2) → the object is streamed back from GCS. An http(s) value is still
 * honoured (fetch upstream) as the D6 single-image fallback / D10 disabled
 * path / pre-persistence legacy logs.
 */

import { prisma } from "@/lib/prisma";
import { Readable } from "node:stream";
import { verifyProxySignature } from "@/lib/api/image-proxy";
import { getImageStore } from "@/lib/storage/gcs-image-store";
import { sanitizeImageContentType } from "@/lib/infra/url-safety";

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
  const source = originalUrls[idx];
  if (typeof source !== "string" || source.length === 0) {
    return new Response("image not found", { status: 404 });
  }

  // BL-SEC-POLISH F-SP-02: restrict Content-Type to known image MIME types;
  // any other value (text/html, application/javascript, etc.) is coerced to
  // application/octet-stream so browsers won't render/execute the payload.

  // Legacy / D6 fallback / D10 disabled: http(s) upstream → fetch and relay.
  if (/^https?:\/\//i.test(source)) {
    const upstreamRes = await fetch(source, { redirect: "follow" });
    if (!upstreamRes.ok || !upstreamRes.body) {
      return new Response("upstream fetch failed", { status: 502 });
    }
    const contentType = sanitizeImageContentType(upstreamRes.headers.get("content-type"));
    return new Response(upstreamRes.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=60",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  // Persisted path: source is a GCS object key → stream the object back.
  const store = getImageStore();
  if (!store) {
    return new Response("image not found", { status: 404 });
  }
  const object = await store.getImageObject(source);
  if (!object) {
    return new Response("image not found", { status: 404 });
  }
  const contentType = sanitizeImageContentType(object.contentType);
  const webStream = Readable.toWeb(object.body) as unknown as ReadableStream<Uint8Array>;
  return new Response(webStream, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      // Persisted objects are immutable for their retention window.
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
