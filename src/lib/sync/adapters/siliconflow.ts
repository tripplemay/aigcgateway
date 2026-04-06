import type { SyncAdapter, SyncedModel, ProviderWithConfig } from "./base";
import { fetchWithTimeout, requireApiKey, getBaseUrl, inferModality, isChatModality } from "./base";

export const siliconflowAdapter: SyncAdapter = {
  providerName: "siliconflow",

  filterModel(modelId: string): boolean {
    return isChatModality(modelId);
  },

  async fetchModels(provider: ProviderWithConfig): Promise<SyncedModel[]> {
    const res = await fetchWithTimeout(
      `${getBaseUrl(provider)}/models`,
      { Authorization: `Bearer ${requireApiKey(provider)}` },
      provider,
    );
    if (!res.ok) throw new Error(`SiliconFlow /models returned ${res.status}`);

    const json = await res.json();
    const rawModels = (json.data ?? []) as Array<{ id: string }>;

    return rawModels
      .filter((m) => isChatModality(m.id))
      .map((m) => ({
        modelId: m.id,
        name: `siliconflow/${m.id}`,
        displayName: m.id,
        modality: inferModality(m.id),
      }));
  },
};
