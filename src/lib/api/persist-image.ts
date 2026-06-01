/**
 * BL-IMG-PERSIST-GCS F-IGP-02 — persist generated images to own storage.
 *
 * Normalises the three response forms (D5) to a Buffer + contentType and
 * uploads them to GCS so the gateway can serve them through a long-lived
 * same-origin signed proxy:
 *   1. data[i].url = http(s)  → server-side fetch
 *   2. data[i].url = data:    → decode the data URI
 *   3. data[i].b64_json       → base64 decode (b64_json-only providers)
 *
 * Key layout (D2): images/{projectId}/{traceId}/{idx}.{ext} — deterministic
 * and idempotent (re-running the same trace overwrites the same object).
 *
 * D6 fallback: any single failure (or storage disabled / unconfigured) yields
 * a null entry for that image; generation never hard-fails on storage errors.
 */

import type { ImageGenerationResponse } from "@/lib/engine/types";
import { getImageStore } from "@/lib/storage/gcs-image-store";
import { extForContentType } from "@/lib/storage/image-store";

export interface PersistedImage {
  /** GCS object key. */
  key: string;
  contentType: string;
}

interface NormalizedImage {
  body: Buffer;
  contentType: string;
}

/** Parse a `data:[<mime>][;base64],<payload>` URI into bytes + contentType. */
function parseDataUri(url: string): NormalizedImage | null {
  const comma = url.indexOf(",");
  if (comma < 0) return null;
  const header = url.slice("data:".length, comma); // e.g. image/png;base64
  const payload = url.slice(comma + 1);
  const isBase64 = /;base64/i.test(header);
  const mime = header.split(";")[0]?.trim() || "image/png";
  try {
    const body = isBase64
      ? Buffer.from(payload, "base64")
      : Buffer.from(decodeURIComponent(payload), "utf-8");
    if (body.length === 0) return null;
    return { body, contentType: mime };
  } catch {
    return null;
  }
}

async function fetchHttpImage(url: string): Promise<NormalizedImage | null> {
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) return null;
    const contentType = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
    return { body: buf, contentType };
  } catch {
    return null;
  }
}

/** Normalise one ImageData entry (D5 three forms) to bytes + contentType. */
async function normalizeImage(item: {
  url?: string;
  b64_json?: string;
}): Promise<NormalizedImage | null> {
  const url = typeof item.url === "string" ? item.url : undefined;
  if (url?.startsWith("data:")) return parseDataUri(url);
  if (url && /^https?:\/\//i.test(url)) return fetchHttpImage(url);
  if (typeof item.b64_json === "string" && item.b64_json.length > 0) {
    try {
      const body = Buffer.from(item.b64_json, "base64");
      if (body.length === 0) return null;
      // b64_json carries no mime; default to PNG (the common generator format).
      return { body, contentType: "image/png" };
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Persist every image in the response. Returns one entry per data item,
 * aligned by index: PersistedImage on success, null on D6 fallback.
 *
 * Returns an all-null array (length matching data) when persistence is
 * disabled or unconfigured — callers MUST treat null as "keep legacy
 * behaviour for this image".
 */
export async function persistGeneratedImages(
  traceId: string,
  projectId: string,
  response: ImageGenerationResponse,
): Promise<Array<PersistedImage | null>> {
  const data = response.data ?? [];
  const store = getImageStore();
  if (!store || data.length === 0) {
    return data.map(() => null);
  }

  return Promise.all(
    data.map(async (item, idx): Promise<PersistedImage | null> => {
      const normalized = await normalizeImage(item);
      if (!normalized) return null;
      const key = `images/${projectId}/${traceId}/${idx}.${extForContentType(normalized.contentType)}`;
      try {
        await store.putImage({
          key,
          body: normalized.body,
          contentType: normalized.contentType,
        });
        return { key, contentType: normalized.contentType };
      } catch (err) {
        console.warn(
          `[persist-image] upload failed for trace=${traceId} idx=${idx} (D6 fallback):`,
          (err as Error).message,
        );
        return null;
      }
    }),
  );
}
