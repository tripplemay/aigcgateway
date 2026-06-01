/**
 * BL-IMG-PERSIST-GCS F-IGP-01 — image storage abstraction.
 *
 * Generated images (http upstream / data: URI / b64_json — all three forms,
 * see persist-image.ts) are normalised to a Buffer and persisted to an
 * own-controlled object store so the gateway can serve them through a
 * same-origin signed proxy URL with a long TTL (90d), instead of relaying
 * short-lived upstream URLs or inlining base64.
 *
 * This file defines the storage-agnostic interface + config helpers. The
 * concrete GCS implementation and the singleton factory live in
 * ./gcs-image-store.ts so this interface stays free of provider imports.
 */

import type { Readable } from "node:stream";

export interface PutImageParams {
  /** Object key, e.g. images/{projectId}/{traceId}/{idx}.{ext} (D2). */
  key: string;
  body: Buffer;
  contentType: string;
}

export interface ImageObject {
  /** Streaming body for proxy passthrough. */
  body: Readable;
  contentType: string;
}

export interface ImageStore {
  putImage(params: PutImageParams): Promise<void>;
  /** Returns null when the object does not exist (proxy → 404). */
  getImageObject(key: string): Promise<ImageObject | null>;
}

/**
 * D10 feature flag. Defaults to **true** — persistence is on unless explicitly
 * disabled. Recognises false/0/no/off (case-insensitive) as disabled so a
 * single env toggle can roll back to the legacy behaviour.
 */
export function isImagePersistEnabled(): boolean {
  const raw = process.env.IMAGE_PERSIST_ENABLED;
  if (raw === undefined || raw.trim() === "") return true;
  return !["false", "0", "no", "off"].includes(raw.trim().toLowerCase());
}

/** GCS bucket name; null when unset (triggers D6 fallback, never a crash). */
export function getImageBucketName(): string | null {
  const bucket = process.env.GCS_IMAGE_BUCKET?.trim();
  return bucket ? bucket : null;
}

/** Map an image content-type to a file extension for deterministic keys (D2). */
export function extForContentType(contentType: string | null | undefined): string {
  const ct = (contentType ?? "").split(";")[0].trim().toLowerCase();
  switch (ct) {
    case "image/png":
      return "png";
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/avif":
      return "avif";
    case "image/svg+xml":
      return "svg";
    default:
      return "bin";
  }
}
