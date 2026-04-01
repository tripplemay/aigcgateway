import type { SyncAdapter, SyncedModel, ProviderWithConfig } from "./base";
import { fetchWithTimeout, getApiKey, getBaseUrl, inferModality } from "./base";

/** 白名单：只同步这些模型前缀 */
const CHAT_WHITELIST = [
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4.1-nano",
  "o3",
  "o3-mini",
  "o4-mini",
];
const IMAGE_WHITELIST = ["dall-e-3", "gpt-image-1"];

function isWhitelisted(id: string): boolean {
  return (
    CHAT_WHITELIST.some((prefix) => id === prefix || id.startsWith(`${prefix}-`)) ||
    IMAGE_WHITELIST.includes(id)
  );
}

export const openaiAdapter: SyncAdapter = {
  providerName: "openai",

  filterModel(modelId: string): boolean {
    return isWhitelisted(modelId);
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
      .filter((m) => isWhitelisted(m.id))
      .map((m) => ({
        modelId: m.id,
        name: `openai/${m.id}`,
        displayName: m.id,
        modality: inferModality(m.id),
      }));
  },
};
