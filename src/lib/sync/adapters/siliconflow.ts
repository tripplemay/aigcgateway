import type { SyncAdapter, SyncedModel, ProviderWithConfig } from "./base";
import { fetchWithTimeout, getApiKey, getBaseUrl, getPricingOverride, inferModality } from "./base";

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
      .map((m) => {
        const override = getPricingOverride(provider.config, m.id);
        const modality = override?.modality === "image" ? "IMAGE" as const : inferModality(m.id);

        return {
          modelId: m.id,
          name: `siliconflow/${m.id}`,
          displayName: override?.displayName ?? m.id,
          modality,
          contextWindow: override?.contextWindow,
          maxOutputTokens: override?.maxOutputTokens,
          inputPricePerM: override?.inputPricePerM,
          outputPricePerM: override?.outputPricePerM,
        };
      });
  },
};
