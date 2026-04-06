import type { SyncAdapter, SyncedModel, ProviderWithConfig } from "./base";
import { fetchWithTimeout, requireApiKey, getBaseUrl, isChatModality } from "./base";

export const anthropicAdapter: SyncAdapter = {
  providerName: "anthropic",

  filterModel(modelId: string): boolean {
    return isChatModality(modelId);
  },

  async fetchModels(provider: ProviderWithConfig): Promise<SyncedModel[]> {
    const res = await fetchWithTimeout(
      `${getBaseUrl(provider)}/models`,
      {
        "x-api-key": requireApiKey(provider),
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

    return rawModels.map((m) => ({
      modelId: m.id,
      name: `anthropic/${m.id}`,
      displayName: m.display_name ?? m.id,
      modality: "TEXT" as const,
      contextWindow: m.max_input_tokens,
      maxOutputTokens: m.max_output_tokens,
    }));
  },
};
