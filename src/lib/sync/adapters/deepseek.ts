import type { SyncAdapter, SyncedModel, ProviderWithConfig } from "./base";
import { fetchWithTimeout, getApiKey, getBaseUrl, getPricingOverride } from "./base";

/** DeepSeek model ID → 友好名称映射 */
const NAME_MAP: Record<string, string> = {
  "deepseek-chat": "deepseek/v3",
  "deepseek-reasoner": "deepseek/reasoner",
};

export const deepseekAdapter: SyncAdapter = {
  providerName: "deepseek",

  async fetchModels(provider: ProviderWithConfig): Promise<SyncedModel[]> {
    const res = await fetchWithTimeout(
      `${getBaseUrl(provider)}/models`,
      { Authorization: `Bearer ${getApiKey(provider)}` },
      provider,
    );
    if (!res.ok) throw new Error(`DeepSeek /models returned ${res.status}`);

    const json = await res.json();
    const rawModels = (json.data ?? []) as Array<{ id: string }>;

    return rawModels.map((m) => {
      const override = getPricingOverride(provider.config, m.id);
      const friendlyName = NAME_MAP[m.id] ?? `deepseek/${m.id}`;

      return {
        modelId: m.id,
        name: friendlyName,
        displayName: override?.displayName ?? m.id,
        modality: "TEXT" as const,
        contextWindow: override?.contextWindow,
        maxOutputTokens: override?.maxOutputTokens,
        inputPricePerM: override?.inputPricePerM,
        outputPricePerM: override?.outputPricePerM,
      };
    });
  },
};
