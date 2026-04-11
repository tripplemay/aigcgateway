import type { SyncAdapter, SyncedModel, ProviderWithConfig } from "./base";
import { fetchWithTimeout, requireApiKey, getBaseUrl, inferModality, isChatModality } from "./base";

interface StaticModelDef {
  id: string;
  displayName?: string;
}

export const minimaxAdapter: SyncAdapter = {
  providerName: "minimax",

  filterModel(modelId: string): boolean {
    return isChatModality(modelId);
  },

  async fetchModels(provider: ProviderWithConfig): Promise<SyncedModel[]> {
    // Try /models API first
    try {
      const res = await fetchWithTimeout(
        `${getBaseUrl(provider)}/models`,
        { Authorization: `Bearer ${requireApiKey(provider)}` },
        provider,
      );
      if (res.ok) {
        const json = await res.json();
        const rawModels = (json.data ?? []) as Array<{ id: string }>;
        const models = rawModels
          .filter((m) => isChatModality(m.id))
          .map((m) => ({
            modelId: m.id,
            name: `minimax/${m.id}`,
            displayName: m.id,
            modality: inferModality(m.id),
          }));
        if (models.length > 0) return models;
      }
      console.warn(
        `[minimax] /models returned ${res.status} or empty, falling back to staticModels`,
      );
    } catch (err) {
      console.warn(
        `[minimax] /models fetch failed: ${err instanceof Error ? err.message : String(err)}, falling back to staticModels`,
      );
    }

    // Fallback to staticModels from provider config
    const staticModels = provider.config?.staticModels;
    if (!Array.isArray(staticModels)) return [];

    return (staticModels as unknown as StaticModelDef[])
      .filter((m) => isChatModality(m.id))
      .map((m) => ({
        modelId: m.id,
        name: `minimax/${m.id}`,
        displayName: m.displayName ?? m.id,
        modality: inferModality(m.id),
      }));
  },
};
