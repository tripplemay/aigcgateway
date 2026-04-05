import type { SyncAdapter, SyncedModel, ProviderWithConfig } from "./base";
import { fetchWithTimeout, getApiKey, getBaseUrl, inferModality } from "./base";
import { isOpenAIModelWhitelisted } from "../model-whitelist";

export const openaiAdapter: SyncAdapter = {
  providerName: "openai",

  filterModel(modelId: string): boolean {
    return isOpenAIModelWhitelisted(modelId);
  },

  async fetchModels(provider: ProviderWithConfig): Promise<SyncedModel[]> {
    const res = await fetchWithTimeout(
      `${getBaseUrl(provider)}/models`,
      { Authorization: `Bearer ${getApiKey(provider)}` },
      provider,
    );
    if (!res.ok) throw new Error(`OpenAI /models returned ${res.status}`);

    const json = await res.json();
    const rawModels = (json.data ?? []) as Array<{ id: string }>;

    return rawModels
      .filter((m) => isOpenAIModelWhitelisted(m.id))
      .map((m) => ({
        modelId: m.id,
        name: `openai/${m.id}`,
        displayName: m.id,
        modality: inferModality(m.id),
      }));
  },
};
