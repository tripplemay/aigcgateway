import type { SyncAdapter, SyncedModel, ProviderWithConfig } from "./base";
import { fetchWithTimeout, requireApiKey, getBaseUrl, inferModality, isChatModality } from "./base";

export const zhipuAdapter: SyncAdapter = {
  providerName: "zhipu",

  filterModel(modelId: string): boolean {
    return isChatModality(modelId);
  },

  async fetchModels(provider: ProviderWithConfig): Promise<SyncedModel[]> {
    const res = await fetchWithTimeout(
      `${getBaseUrl(provider)}/models`,
      { Authorization: `Bearer ${requireApiKey(provider)}` },
      provider,
    );
    if (!res.ok) throw new Error(`Zhipu /models returned ${res.status}`);

    const json = await res.json();
    const rawModels = (json.data ?? []) as Array<{ id: string }>;

    return rawModels
      .filter((m) => isChatModality(m.id))
      .map((m) => ({
        modelId: m.id,
        name: `zhipu/${m.id}`,
        displayName: m.id,
        modality: inferModality(m.id),
      }));
  },
};
