import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProviderWithConfig } from "@/lib/sync/types";

const mocks = vi.hoisted(() => {
  const mockPrisma = {
    provider: {
      findMany: vi.fn(),
    },
    channel: {
      findMany: vi.fn(),
      count: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    model: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
    },
  };

  return {
    mockPrisma,
    mockRedis: {
      set: vi.fn(),
      del: vi.fn(),
    },
    acquireLeaderLock: vi.fn(),
    releaseLeaderLock: vi.fn(),
    setConfig: vi.fn(),
    classifyNewModels: vi.fn(),
    inferMissingBrands: vi.fn(),
    inferMissingCapabilities: vi.fn(),
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: mocks.mockPrisma }));
vi.mock("@/lib/redis", () => ({ getRedis: () => mocks.mockRedis }));
vi.mock("@/lib/infra/leader-lock", () => ({
  acquireLeaderLock: mocks.acquireLeaderLock,
  releaseLeaderLock: mocks.releaseLeaderLock,
}));
vi.mock("@/lib/config", () => ({ setConfig: mocks.setConfig }));
vi.mock("@/lib/sync/alias-classifier", () => ({
  classifyNewModels: mocks.classifyNewModels,
  inferMissingBrands: mocks.inferMissingBrands,
  inferMissingCapabilities: mocks.inferMissingCapabilities,
}));

import { runModelSync } from "@/lib/sync/model-sync";

function provider(overrides: Partial<ProviderWithConfig>): ProviderWithConfig {
  return {
    id: "prov_1",
    name: "guangtech",
    displayName: "Guangtech",
    baseUrl: "https://example.test/v1",
    authType: "bearer",
    authConfig: { apiKey: "test-key" },
    rateLimit: null,
    proxyUrl: null,
    status: "ACTIVE",
    adapterType: "openai-compat",
    createdAt: new Date("2026-07-03T00:00:00Z"),
    updatedAt: new Date("2026-07-03T00:00:00Z"),
    config: null,
    ...overrides,
  } as unknown as ProviderWithConfig;
}

function installModelRowsAfterCreate(modelNames: string[]) {
  mocks.mockPrisma.model.findMany
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce(
      modelNames.map((name, index) => ({
        id: `model_${index + 1}`,
        name,
        contextWindow: null,
      })),
    );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.stubEnv("PROXY_URL_PRIMARY", "");

  mocks.acquireLeaderLock.mockResolvedValue(true);
  mocks.releaseLeaderLock.mockResolvedValue(undefined);
  mocks.mockRedis.set.mockResolvedValue("OK");
  mocks.mockRedis.del.mockResolvedValue(1);
  mocks.setConfig.mockResolvedValue(undefined);
  mocks.classifyNewModels.mockResolvedValue({ classified: 0, newAliases: 0, skipped: 0 });
  mocks.inferMissingBrands.mockResolvedValue({ updated: 0, skipped: 0 });
  mocks.inferMissingCapabilities.mockResolvedValue({ updated: 0, skipped: 0 });

  mocks.mockPrisma.channel.findMany.mockResolvedValue([]);
  mocks.mockPrisma.channel.count.mockResolvedValue(0);
  mocks.mockPrisma.channel.createMany.mockImplementation(async (args: { data: unknown[] }) => ({
    count: args.data.length,
  }));
  mocks.mockPrisma.channel.update.mockResolvedValue({ id: "channel_1" });
  mocks.mockPrisma.channel.updateMany.mockResolvedValue({ count: 0 });
  mocks.mockPrisma.model.createMany.mockImplementation(async (args: { data: unknown[] }) => ({
    count: args.data.length,
  }));
  mocks.mockPrisma.model.update.mockResolvedValue({ id: "model_1" });
});

describe("model-sync adapter dispatch (BL-SYNC-ADAPTERTYPE-FALLBACK)", () => {
  it("falls back to openai-compat adapter when provider.name is unknown but adapterType matches", async () => {
    mocks.mockPrisma.provider.findMany.mockResolvedValue([
      provider({ id: "prov_guangtech", name: "guangtech", adapterType: "openai-compat" }),
    ]);
    installModelRowsAfterCreate(["gpt-5.5", "gpt-5.3-codex"]);

    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("https://example.test/v1/models");
      expect(init?.headers).toMatchObject({ Authorization: "Bearer test-key" });
      return new Response(
        JSON.stringify({
          data: [{ id: "gpt-5.5" }, { id: "gpt-5.3-codex" }, { id: "text-embedding-3-large" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const result = await runModelSync();

    expect(result.providers).toHaveLength(1);
    expect(result.providers[0]).toMatchObject({
      providerName: "guangtech",
      success: true,
      apiModels: 2,
      modelCount: 2,
    });
    expect(result.providers[0].error).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.mockPrisma.channel.createMany).toHaveBeenCalledTimes(1);
    const createCall = mocks.mockPrisma.channel.createMany.mock.calls[0][0] as {
      data: Array<{ realModelId: string; providerId: string }>;
    };
    expect(createCall.data.map((row) => row.realModelId)).toEqual(["gpt-5.5", "gpt-5.3-codex"]);
    expect(createCall.data.every((row) => row.providerId === "prov_guangtech")).toBe(true);
  });

  it("keeps provider.name priority for named adapters even when adapterType is openai-compat", async () => {
    mocks.mockPrisma.provider.findMany.mockResolvedValue([
      provider({
        id: "prov_deepseek",
        name: "deepseek",
        baseUrl: "https://api.deepseek.test/v1",
        adapterType: "openai-compat",
      }),
    ]);
    installModelRowsAfterCreate(["dall-e-3"]);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ data: [{ id: "dall-e-3" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ) as unknown as typeof fetch,
    );

    const result = await runModelSync();

    expect(result.providers[0]).toMatchObject({
      providerName: "deepseek",
      success: true,
      apiModels: 1,
      modelCount: 1,
    });
    expect(result.providers[0].skippedImageChannels).toEqual([]);
    expect(mocks.mockPrisma.channel.createMany).toHaveBeenCalledTimes(1);
    const createCall = mocks.mockPrisma.channel.createMany.mock.calls[0][0] as {
      data: Array<{ realModelId: string; costPrice: { unit: string } }>;
    };
    expect(createCall.data).toEqual([
      expect.objectContaining({
        realModelId: "dall-e-3",
        costPrice: { inputPer1M: 0, outputPer1M: 0, unit: "token" },
      }),
    ]);
  });

  it("preserves the no-adapter failure path and includes adapterType in the diagnostic", async () => {
    mocks.mockPrisma.provider.findMany.mockResolvedValue([
      provider({
        id: "prov_custom",
        name: "custom-provider",
        adapterType: "custom-compat",
      }),
    ]);
    mocks.mockPrisma.model.findMany.mockResolvedValue([]);

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const result = await runModelSync();

    expect(result.providers).toEqual([
      expect.objectContaining({
        providerName: "custom-provider",
        success: false,
        error: 'No sync adapter found for provider "custom-provider" (adapterType="custom-compat")',
        apiModels: 0,
        modelCount: 0,
      }),
    ]);
    expect(result.summary.totalFailedProviders).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.mockPrisma.channel.createMany).not.toHaveBeenCalled();
  });
});
