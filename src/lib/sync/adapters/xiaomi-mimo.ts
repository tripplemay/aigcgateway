import type { SyncAdapter, SyncedModel, ProviderWithConfig } from "./base";
import { fetchWithTimeout, requireApiKey, getBaseUrl, inferModality, isChatModality } from "./base";

/**
 * BL-SYNC-INTEGRITY-PHASE1 F-SI-02 — xiaomi-mimo sync adapter.
 *
 * Provider context (verified by Generator before implementation):
 *   - baseUrl: https://token-plan-cn.xiaomimimo.com/v1
 *   - adapterType: openai-compat (Provider.adapterType in DB)
 *   - /v1/models returns standard OpenAI shape: { object: 'list', data: [{ id, object, owned_by }] }
 *   - 8 models as of 2026-05-02: 4 chat (mimo-v2-omni / mimo-v2-pro /
 *     mimo-v2.5 / mimo-v2.5-pro) + 4 TTS (mimo-v2-tts and friends).
 *     filterModel=isChatModality keeps the 4 chat ones (TEXT) and drops
 *     the AUDIO/TTS ones — matches spec D2 "MiMo currently chat-only".
 *
 * Model name uses `xiaomi/` prefix (not `xiaomi-mimo/`) to align with the
 * existing production channels created when the provider was first wired
 * (e.g. `xiaomi/mimo-v2-omni`).
 */
export const xiaomiMimoAdapter: SyncAdapter = {
  providerName: "xiaomi-mimo",

  filterModel(modelId: string): boolean {
    return isChatModality(modelId);
  },

  async fetchModels(provider: ProviderWithConfig): Promise<SyncedModel[]> {
    const res = await fetchWithTimeout(
      `${getBaseUrl(provider)}/models`,
      { Authorization: `Bearer ${requireApiKey(provider)}` },
      provider,
    );
    if (!res.ok) throw new Error(`xiaomi-mimo /models returned ${res.status}`);

    const json = await res.json();
    const rawModels = (json.data ?? []) as Array<{ id: string }>;

    return rawModels
      .filter((m) => isChatModality(m.id))
      .map((m) => ({
        modelId: m.id,
        name: `xiaomi/${m.id}`,
        displayName: m.id,
        modality: inferModality(m.id),
      }));
  },
};
