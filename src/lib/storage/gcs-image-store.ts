/**
 * BL-IMG-PERSIST-GCS F-IGP-01 — Google Cloud Storage implementation of
 * ImageStore + lazy singleton factory.
 *
 * Auth: Application Default Credentials (ADC). In production the GCP VM's
 * default service account is used (no key file). Locally, gcloud ADC or
 * GOOGLE_APPLICATION_CREDENTIALS work transparently.
 *
 * Bucket is private (D3); objects are served only through the signed proxy.
 */

import { Storage } from "@google-cloud/storage";
import type { ImageStore, ImageObject, PutImageParams } from "./image-store";
import { getImageBucketName, isImagePersistEnabled } from "./image-store";

export class GcsImageStore implements ImageStore {
  private readonly storage: Storage;
  private readonly bucketName: string;

  constructor(bucketName: string) {
    this.bucketName = bucketName;
    // No keyFilename → ADC (VM default SA in prod).
    this.storage = new Storage();
  }

  async putImage({ key, body, contentType }: PutImageParams): Promise<void> {
    const file = this.storage.bucket(this.bucketName).file(key);
    await file.save(body, {
      contentType,
      resumable: false,
      metadata: { contentType },
    });
  }

  async getImageObject(key: string): Promise<ImageObject | null> {
    const file = this.storage.bucket(this.bucketName).file(key);
    const [exists] = await file.exists();
    if (!exists) return null;

    let contentType = "application/octet-stream";
    try {
      const [metadata] = await file.getMetadata();
      if (typeof metadata.contentType === "string" && metadata.contentType) {
        contentType = metadata.contentType;
      }
    } catch {
      // metadata fetch failure is non-fatal; fall back to octet-stream.
    }

    return { body: file.createReadStream(), contentType };
  }
}

/**
 * Lazy singleton. Returns null (persistence unavailable) when the feature flag
 * is off or no bucket is configured — callers MUST treat null as the D6
 * fallback path and never crash.
 *
 * `undefined` sentinel distinguishes "not yet resolved" from a resolved null.
 */
let _store: ImageStore | null | undefined;

export function getImageStore(): ImageStore | null {
  if (_store !== undefined) return _store;

  if (!isImagePersistEnabled()) {
    _store = null;
    return _store;
  }

  const bucket = getImageBucketName();
  if (!bucket) {
    console.warn(
      "[image-store] IMAGE_PERSIST_ENABLED is on but GCS_IMAGE_BUCKET is not set — " +
        "image persistence disabled (D6 fallback to legacy behaviour).",
    );
    _store = null;
    return _store;
  }

  _store = new GcsImageStore(bucket);
  return _store;
}

/** Test-only: reset the memoised store so env changes take effect. */
export function __resetImageStoreForTest(): void {
  _store = undefined;
}
