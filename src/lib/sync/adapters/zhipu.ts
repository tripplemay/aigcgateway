import type { SyncAdapter, SyncedModel, ProviderWithConfig } from "./base";
import { fetchWithTimeout, getApiKey, getBaseUrl, inferModality } from "./base";
import { isModelWhitelisted } from "../model-whitelist";

export const zhipuAdapter: SyncAdapter = {
  providerName: "zhipu",

  filterModel(modelId: string): boolean {
    return isModelWhitelisted("zhipu", modelId);
  },

  async fetchModels(provider: ProviderWithConfig): Promise<SyncedModel[]> {
    const res = await fetchWithTimeout(
      `${getBaseUrl(provider)}/models`,
      { Authorization: `Bearer ${getApiKey(provider)}` },
      provider,
    );
    if (!res.ok) throw new Error(`Zhipu /models returned ${res.status}`);

    const json = await res.json();
    const rawModels = (json.data ?? []) as Array<{ id: string }>;

    return rawModels
      .filter((m) => isModelWhitelisted("zhipu", m.id))
      .map((m) => ({
        modelId: m.id,
        name: `zhipu/${m.id}`,
        displayName: m.id,
        modality: inferModality(m.id),
      }));
  },
};
