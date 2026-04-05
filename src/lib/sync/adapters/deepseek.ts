import type { SyncAdapter, SyncedModel, ProviderWithConfig } from "./base";
import { fetchWithTimeout, getApiKey, getBaseUrl } from "./base";
import { isModelWhitelisted } from "../model-whitelist";

/** DeepSeek model ID → 友好名称映射（命名规范，非硬编码数据） */
const NAME_MAP: Record<string, string> = {
  "deepseek-chat": "deepseek/v3",
  "deepseek-reasoner": "deepseek/reasoner",
};

export const deepseekAdapter: SyncAdapter = {
  providerName: "deepseek",

  filterModel(modelId: string): boolean {
    return isModelWhitelisted("deepseek", modelId);
  },

  async fetchModels(provider: ProviderWithConfig): Promise<SyncedModel[]> {
    const res = await fetchWithTimeout(
      `${getBaseUrl(provider)}/models`,
      { Authorization: `Bearer ${getApiKey(provider)}` },
      provider,
    );
    if (!res.ok) throw new Error(`DeepSeek /models returned ${res.status}`);

    const json = await res.json();
    const rawModels = (json.data ?? []) as Array<{ id: string }>;

    return rawModels.map((m) => ({
      modelId: m.id,
      name: NAME_MAP[m.id] ?? `deepseek/${m.id}`,
      displayName: m.id,
      modality: "TEXT" as const,
    }));
  },
};
