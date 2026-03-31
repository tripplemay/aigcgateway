import type { SyncAdapter, SyncedModel, ProviderWithConfig } from "./base";
import { fetchWithTimeout, getApiKey, getBaseUrl, inferModality } from "./base";

/** 排除这些类型的模型 */
const EXCLUDED_KEYWORDS = ["embedding", "rerank", "audio", "tts", "whisper", "asr"];

function shouldExclude(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  return EXCLUDED_KEYWORDS.some((kw) => lower.includes(kw));
}

export const siliconflowAdapter: SyncAdapter = {
  providerName: "siliconflow",

  async fetchModels(provider: ProviderWithConfig): Promise<SyncedModel[]> {
    const res = await fetchWithTimeout(
      `${getBaseUrl(provider)}/models`,
      { Authorization: `Bearer ${getApiKey(provider)}` },
      provider,
    );
    if (!res.ok) throw new Error(`SiliconFlow /models returned ${res.status}`);

    const json = await res.json();
    const rawModels = (json.data ?? []) as Array<{ id: string }>;

    return rawModels
      .filter((m) => !shouldExclude(m.id))
      .map((m) => ({
        modelId: m.id,
        name: `siliconflow/${m.id}`,
        displayName: m.id,
        modality: inferModality(m.id),
      }));
  },
};
