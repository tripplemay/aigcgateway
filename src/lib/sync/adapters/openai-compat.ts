import type { SyncAdapter, SyncedModel, ProviderWithConfig } from "./base";
import { fetchWithTimeout, requireApiKey, getBaseUrl, inferModality, isChatModality } from "./base";

/**
 * 通用 OpenAI 兼容同步适配器。
 *
 * 用于没有专属 named 适配器、但 adapterType 为 "openai-compat" 的 provider
 * （典型：后台 UI 新增的第三方 OpenAI 兼容端点，如 guangtech）。
 *
 * 与内置 named 适配器（openai/deepseek/...）的区别：模型名前缀不写死，
 * 动态取 `provider.name`，避免不同 provider 撞名。派发逻辑见 model-sync.ts
 * 的 ADAPTERS_BY_TYPE 回退。
 */
export const openaiCompatAdapter: SyncAdapter = {
  providerName: "openai-compat",

  filterModel(modelId: string): boolean {
    return isChatModality(modelId);
  },

  async fetchModels(provider: ProviderWithConfig): Promise<SyncedModel[]> {
    const res = await fetchWithTimeout(
      `${getBaseUrl(provider)}/models`,
      { Authorization: `Bearer ${requireApiKey(provider)}` },
      provider,
    );
    if (!res.ok) throw new Error(`${provider.name} /models returned ${res.status}`);

    const json = await res.json();
    const rawModels = (json.data ?? []) as Array<{ id: string; display_name?: string }>;

    return rawModels
      .filter((m) => isChatModality(m.id))
      .map((m) => ({
        modelId: m.id,
        name: `${provider.name}/${m.id}`,
        displayName: m.display_name ?? m.id,
        modality: inferModality(m.id),
      }));
  },
};
