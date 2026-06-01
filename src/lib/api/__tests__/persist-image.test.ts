import { beforeEach, describe, expect, it, vi } from "vitest";

const getImageStoreMock = vi.fn();

vi.mock("@/lib/storage/gcs-image-store", () => ({
  getImageStore: () => getImageStoreMock(),
}));

import { persistGeneratedImages } from "../persist-image";

describe("BL-IMG-PERSIST-GCS persistGeneratedImages", () => {
  beforeEach(() => {
    getImageStoreMock.mockReset();
  });

  it("persists a b64_json-only image and returns an index-aligned key", async () => {
    const putImage = vi.fn().mockResolvedValue(undefined);
    getImageStoreMock.mockReturnValue({ putImage });

    const onePixelPng =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0ioAAAAASUVORK5CYII=";

    const result = await persistGeneratedImages("trc_b64_only", "proj_test", {
      created: Date.now(),
      data: [{ b64_json: onePixelPng }],
    });

    expect(result).toEqual([
      {
        key: "images/proj_test/trc_b64_only/0.png",
        contentType: "image/png",
      },
    ]);
    expect(putImage).toHaveBeenCalledTimes(1);
    expect(putImage).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "images/proj_test/trc_b64_only/0.png",
        contentType: "image/png",
      }),
    );
    const call = putImage.mock.calls[0]?.[0];
    expect(Buffer.isBuffer(call.body)).toBe(true);
    expect(call.body.length).toBeGreaterThan(0);
  });

  it("returns all-null entries when persistence is unavailable", async () => {
    getImageStoreMock.mockReturnValue(null);

    const result = await persistGeneratedImages("trc_disabled", "proj_test", {
      created: Date.now(),
      data: [{ b64_json: "AAAA" }, { url: "data:image/png;base64,AAAA" }],
    });

    expect(result).toEqual([null, null]);
  });

  it("uses D6 fallback when storage upload throws", async () => {
    const putImage = vi.fn().mockRejectedValue(new Error("boom"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    getImageStoreMock.mockReturnValue({ putImage });

    const result = await persistGeneratedImages("trc_d6", "proj_test", {
      created: Date.now(),
      data: [{ b64_json: "AAAA" }],
    });

    expect(result).toEqual([null]);
    expect(putImage).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});
