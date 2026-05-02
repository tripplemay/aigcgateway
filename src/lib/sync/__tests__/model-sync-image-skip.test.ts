/**
 * BL-SYNC-INTEGRITY-PHASE1 F-SI-01 — IMAGE channel sync skip regression.
 *
 * F-BAX-08 added DB CHECK 23514 forbidding all-zero costPrice on IMAGE
 * channels. The legacy createMany path used `{perCall:0,unit:'call'}` as a
 * placeholder, which would now fail INSERT and silently roll back the whole
 * provider's create batch (including TEXT channels). F-SI-01 makes reconcile
 * skip IMAGE channel creation entirely; operators handle IMAGE channels
 * manually via Admin UI.
 *
 * This test pins:
 *   (a) reconcile does not include the IMAGE remote in channel.createMany input
 *   (b) reconcile does include the non-IMAGE remote in channel.createMany input
 *   (c) reconcile.skippedImageChannels contains the IMAGE label
 *   (d) reconcile.newChannels contains only the non-IMAGE label
 *   (e) IMAGE remote still ends up in models.createMany (model row preserved)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => {
  return {
    mockPrisma: {
      channel: {
        findMany: vi.fn(),
        createMany: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        count: vi.fn(),
      },
      model: {
        findMany: vi.fn(),
        createMany: vi.fn(),
        update: vi.fn(),
      },
    },
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { __testing } from "../model-sync";
import type { ProviderWithConfig, SyncedModel } from "../types";

const { reconcile } = __testing;

const provider: ProviderWithConfig = {
  id: "prov_silicon",
  name: "siliconflow",
  config: null,
} as unknown as ProviderWithConfig;

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.channel.findMany.mockResolvedValue([]);
  mockPrisma.channel.createMany.mockImplementation(async (args: { data: unknown[] }) => ({
    count: args.data.length,
  }));
  mockPrisma.channel.update.mockResolvedValue({ id: "ch" });
  mockPrisma.channel.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.channel.count.mockResolvedValue(0);
  mockPrisma.model.createMany.mockImplementation(async (args: { data: unknown[] }) => ({
    count: args.data.length,
  }));
  mockPrisma.model.update.mockResolvedValue({ id: "m" });
});

describe("reconcile IMAGE skip (F-SI-01)", () => {
  it("excludes IMAGE remote from channel.createMany while including TEXT remote", async () => {
    // First model.findMany returns empty (forces model createMany).
    // Second call (refresh after createMany) returns the now-created rows
    // so reconcile can map canonical → model.id when building channel rows.
    mockPrisma.model.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: "mid_text", name: "siliconflow/text-model", contextWindow: null },
        { id: "mid_image", name: "siliconflow/image-model", contextWindow: null },
      ]);

    const remotes: SyncedModel[] = [
      {
        modelId: "siliconflow/text-model",
        name: "siliconflow/text-model",
        displayName: "Text Model",
        modality: "TEXT",
        inputPricePerM: 0.1,
        outputPricePerM: 0.2,
      },
      {
        modelId: "siliconflow/image-model",
        name: "siliconflow/image-model",
        displayName: "Image Model",
        modality: "IMAGE",
      },
    ];

    const result = await reconcile(provider, remotes);

    // (a)+(b) channel.createMany was called and only TEXT realModelId is in data
    expect(mockPrisma.channel.createMany).toHaveBeenCalledTimes(1);
    const createCall = mockPrisma.channel.createMany.mock.calls[0][0] as { data: Array<{ realModelId: string }> };
    const createdRealIds = createCall.data.map((c) => c.realModelId);
    expect(createdRealIds).toEqual(["siliconflow/text-model"]);
    expect(createdRealIds).not.toContain("siliconflow/image-model");

    // (c) skippedImageChannels carries the IMAGE label
    expect(result.skippedImageChannels).toEqual([
      "siliconflow/siliconflow/image-model → siliconflow/image-model",
    ]);

    // (d) newChannels contains only the non-IMAGE label
    expect(result.newChannels).toEqual([
      "siliconflow/siliconflow/text-model → siliconflow/text-model",
    ]);

    // (e) IMAGE row still present in models.createMany — model is preserved
    expect(mockPrisma.model.createMany).toHaveBeenCalledTimes(1);
    const modelCreateCall = mockPrisma.model.createMany.mock.calls[0][0] as { data: Array<{ name: string }> };
    const createdModelNames = modelCreateCall.data.map((m) => m.name);
    expect(createdModelNames).toContain("siliconflow/image-model");
    expect(createdModelNames).toContain("siliconflow/text-model");
  });

  it("when only IMAGE remotes exist, channel.createMany is not called at all", async () => {
    mockPrisma.model.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: "mid_image", name: "siliconflow/image-model", contextWindow: null },
      ]);

    const remotes: SyncedModel[] = [
      {
        modelId: "siliconflow/image-model",
        name: "siliconflow/image-model",
        displayName: "Image Only",
        modality: "IMAGE",
      },
    ];

    const result = await reconcile(provider, remotes);

    // The reconcile guard `if (channelsToCreate.length > 0)` short-circuits.
    expect(mockPrisma.channel.createMany).not.toHaveBeenCalled();
    expect(result.newChannels).toEqual([]);
    expect(result.skippedImageChannels).toEqual([
      "siliconflow/siliconflow/image-model → siliconflow/image-model",
    ]);
  });
});
