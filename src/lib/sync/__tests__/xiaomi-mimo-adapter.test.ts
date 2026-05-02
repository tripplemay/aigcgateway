/**
 * BL-SYNC-INTEGRITY-PHASE1 F-SI-02 — xiaomi-mimo sync adapter contract.
 *
 * Pre-impl shape verification (Generator ran 2026-05-02):
 *   curl -H "Authorization: Bearer $KEY" https://token-plan-cn.xiaomimimo.com/v1/models
 *   → { "object": "list", "data": [{ "id": "...", "object": "model", "owned_by": "xiaomi" }, ...] }
 *   8 models returned: 4 chat (mimo-v2-omni / -pro / mimo-v2.5 / -pro)
 *   + 4 TTS (mimo-v2-tts / mimo-v2.5-tts / -voiceclone / -voicedesign).
 *
 * This test pins:
 *   (a) ADAPTERS dict contains 'xiaomi-mimo' key — sync no longer throws
 *       "No sync adapter found" (the production failure)
 *   (b) adapter.providerName matches the registered key
 *   (c) filterModel drops TTS / AUDIO ids and keeps chat ids
 *   (d) fetchModels parses OpenAI shape, filters via isChatModality, and
 *       prefixes name as `xiaomi/{id}` to align with prod channel naming
 *   (e) fetchModels propagates non-2xx as a thrown Error (so reconcile sees
 *       a clear failure mode, not silent empty-list)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { xiaomiMimoAdapter } from "../adapters/xiaomi-mimo";
import { __testing } from "../model-sync";
import type { ProviderWithConfig } from "../types";

const { ADAPTERS } = __testing;

const fixtureProvider: ProviderWithConfig = {
  id: "p1",
  name: "xiaomi-mimo",
  displayName: "Xiaomi MiMo",
  baseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
  authType: "bearer",
  authConfig: { apiKey: "test-key" },
  rateLimit: null,
  proxyUrl: null,
  status: "ACTIVE",
  adapterType: "openai-compat",
  createdAt: new Date(),
  updatedAt: new Date(),
  config: null,
} as unknown as ProviderWithConfig;

const realPayload = {
  object: "list",
  data: [
    { id: "mimo-v2-omni", object: "model", owned_by: "xiaomi" },
    { id: "mimo-v2-pro", object: "model", owned_by: "xiaomi" },
    { id: "mimo-v2-tts", object: "model", owned_by: "xiaomi" },
    { id: "mimo-v2.5", object: "model", owned_by: "xiaomi" },
    { id: "mimo-v2.5-pro", object: "model", owned_by: "xiaomi" },
    { id: "mimo-v2.5-tts", object: "model", owned_by: "xiaomi" },
    { id: "mimo-v2.5-tts-voiceclone", object: "model", owned_by: "xiaomi" },
    { id: "mimo-v2.5-tts-voicedesign", object: "model", owned_by: "xiaomi" },
  ],
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("xiaomi-mimo adapter (F-SI-02)", () => {
  it("(a) ADAPTERS dict has 'xiaomi-mimo' entry — fixes 'No sync adapter found' production error", () => {
    expect(ADAPTERS["xiaomi-mimo"]).toBeDefined();
    expect(ADAPTERS["xiaomi-mimo"]).toBe(xiaomiMimoAdapter);
  });

  it("(b) adapter.providerName matches the registered key 'xiaomi-mimo'", () => {
    expect(xiaomiMimoAdapter.providerName).toBe("xiaomi-mimo");
  });

  it("(c) filterModel keeps chat ids and drops TTS / AUDIO ids", () => {
    expect(xiaomiMimoAdapter.filterModel?.("mimo-v2-omni")).toBe(true);
    expect(xiaomiMimoAdapter.filterModel?.("mimo-v2-pro")).toBe(true);
    expect(xiaomiMimoAdapter.filterModel?.("mimo-v2.5")).toBe(true);
    expect(xiaomiMimoAdapter.filterModel?.("mimo-v2.5-pro")).toBe(true);
    expect(xiaomiMimoAdapter.filterModel?.("mimo-v2-tts")).toBe(false);
    expect(xiaomiMimoAdapter.filterModel?.("mimo-v2.5-tts")).toBe(false);
    expect(xiaomiMimoAdapter.filterModel?.("mimo-v2.5-tts-voiceclone")).toBe(false);
    expect(xiaomiMimoAdapter.filterModel?.("mimo-v2.5-tts-voicedesign")).toBe(false);
  });

  it("(d) fetchModels parses OpenAI shape, prefixes name with 'xiaomi/', drops TTS", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify(realPayload), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ) as unknown as typeof fetch,
    );

    const synced = await xiaomiMimoAdapter.fetchModels(fixtureProvider);

    expect(synced.map((m) => m.modelId)).toEqual([
      "mimo-v2-omni",
      "mimo-v2-pro",
      "mimo-v2.5",
      "mimo-v2.5-pro",
    ]);
    expect(synced.every((m) => m.name.startsWith("xiaomi/"))).toBe(true);
    expect(synced.every((m) => m.modality === "TEXT")).toBe(true);
    expect(synced[0]).toMatchObject({
      modelId: "mimo-v2-omni",
      name: "xiaomi/mimo-v2-omni",
      displayName: "mimo-v2-omni",
      modality: "TEXT",
    });
  });

  it("(e) fetchModels throws on non-2xx so reconcile surfaces failure (not silent empty)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("Unauthorized", { status: 401 }),
      ) as unknown as typeof fetch,
    );
    await expect(xiaomiMimoAdapter.fetchModels(fixtureProvider)).rejects.toThrow(
      /xiaomi-mimo \/models returned 401/,
    );
  });
});
