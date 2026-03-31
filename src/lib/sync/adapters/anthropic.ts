import type { SyncAdapter, SyncedModel, ProviderWithConfig } from "./base";
import { fetchWithTimeout, getApiKey, getBaseUrl, getPricingOverride } from "./base";

export const anthropicAdapter: SyncAdapter = {
  providerName: "anthropic",

  async fetchModels(provider: ProviderWithConfig): Promise<SyncedModel[]> {
    const res = await fetchWithTimeout(
      `${getBaseUrl(provider)}/models`,
      {
        "x-api-key": getApiKey(provider),
        "anthropic-version": "2023-06-01",
      },
      provider,
    );
    if (!res.ok) throw new Error(`Anthropic /models returned ${res.status}`);

    const json = await res.json();
    const rawModels = (json.data ?? []) as Array<{
      id: string;
      display_name?: string;
      max_input_tokens?: number;
      max_output_tokens?: number;
    }>;

    return rawModels.map((m) => {
      const override = getPricingOverride(provider.config, m.id);

      return {
        modelId: m.id,
        name: `anthropic/${m.id}`,
        displayName: override?.displayName ?? m.display_name ?? m.id,
        modality: "TEXT" as const,
        contextWindow: m.max_input_tokens ?? override?.contextWindow,
        maxOutputTokens: m.max_output_tokens ?? override?.maxOutputTokens,
        inputPricePerM: override?.inputPricePerM,
        outputPricePerM: override?.outputPricePerM,
      };
    });
  },
};
