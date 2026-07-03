import { beforeEach, describe, expect, it, vi } from "vitest";

import { openaiCompatAdapter } from "@/lib/sync/adapters/openai-compat";
import type { ProviderWithConfig } from "@/lib/sync/types";

const provider = {
  id: "prov_guangtech",
  name: "guangtech",
  displayName: "Guangtech",
  baseUrl: "https://example.test/v1/",
  authType: "bearer",
  authConfig: { apiKey: "test-key" },
  rateLimit: null,
  proxyUrl: null,
  status: "ACTIVE",
  adapterType: "openai-compat",
  createdAt: new Date("2026-07-03T00:00:00Z"),
  updatedAt: new Date("2026-07-03T00:00:00Z"),
  config: null,
} as unknown as ProviderWithConfig;

describe("openai-compat sync adapter (BL-SYNC-ADAPTERTYPE-FALLBACK)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.stubEnv("PROXY_URL_PRIMARY", "");
  });

  it("parses OpenAI /models shape with dynamic provider prefix and filters non-chat modalities", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("https://example.test/v1/models");
      expect(init?.headers).toMatchObject({ Authorization: "Bearer test-key" });

      return new Response(
        JSON.stringify({
          data: [
            { id: "gpt-5.5", display_name: "GPT 5.5" },
            { id: "gpt-5.3-codex" },
            { id: "seedream-4.5", display_name: "Seedream 4.5" },
            { id: "text-embedding-3-large" },
            { id: "bge-reranker-v2" },
            { id: "mimo-v2-tts" },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const models = await openaiCompatAdapter.fetchModels(provider);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(models).toEqual([
      {
        modelId: "gpt-5.5",
        name: "guangtech/gpt-5.5",
        displayName: "GPT 5.5",
        modality: "TEXT",
      },
      {
        modelId: "gpt-5.3-codex",
        name: "guangtech/gpt-5.3-codex",
        displayName: "gpt-5.3-codex",
        modality: "TEXT",
      },
      {
        modelId: "seedream-4.5",
        name: "guangtech/seedream-4.5",
        displayName: "Seedream 4.5",
        modality: "IMAGE",
      },
    ]);
  });

  it("exposes openai-compat provider name and the same chat modality filter used by model-sync", () => {
    expect(openaiCompatAdapter.providerName).toBe("openai-compat");
    expect(openaiCompatAdapter.filterModel?.("gpt-5.5")).toBe(true);
    expect(openaiCompatAdapter.filterModel?.("seedream-4.5")).toBe(true);
    expect(openaiCompatAdapter.filterModel?.("text-embedding-3-large")).toBe(false);
    expect(openaiCompatAdapter.filterModel?.("bge-reranker-v2")).toBe(false);
    expect(openaiCompatAdapter.filterModel?.("mimo-v2-tts")).toBe(false);
  });

  it("throws a provider-scoped error on non-2xx /models response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Unauthorized", { status: 401 })) as unknown as typeof fetch,
    );

    await expect(openaiCompatAdapter.fetchModels(provider)).rejects.toThrow(
      /guangtech \/models returned 401/,
    );
  });

  it("fails fast when authConfig has no apiKey", async () => {
    const missingKeyProvider = {
      ...provider,
      authConfig: {},
    } as unknown as ProviderWithConfig;

    await expect(openaiCompatAdapter.fetchModels(missingKeyProvider)).rejects.toThrow(
      /Provider "guangtech" has no API Key configured/,
    );
  });
});
