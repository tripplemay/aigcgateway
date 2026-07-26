import type { SyncAdapter, SyncedModel, ProviderWithConfig } from "./base";
import { fetchWithTimeout, requireApiKey, getBaseUrl, isChatModality } from "./base";

/**
 * BL-DEEPSEEK-V4-HOTFIX F-DSV4-04：原有 `deepseek-chat → deepseek/v3` /
 * `deepseek-reasoner → deepseek/reasoner` 两条映射已是死代码 —— DeepSeek 直连
 * `/models` 只返回 `deepseek-v4-pro` / `deepseek-v4-flash`，那两个 id 再也不会
 * 出现在输入里。
 *
 * 删除是安全的，因为 `SyncedModel.name` **不参与 models.name 的确定**：
 * `model-sync.resolveCanonicalName` 对有专属适配器的 provider（deepseek 即是）
 * 直接取裸 modelId 作 canonical name，只有走通用兜底适配器的 provider 才加
 * `provider/` 前缀。该字段目前唯一的消费者是 `doc-enricher.mergeModels`，
 * 拿它做 AI 补全结果的次级匹配键。因此改动不会产生重复 model 行。
 */
export const deepseekAdapter: SyncAdapter = {
  providerName: "deepseek",

  filterModel(modelId: string): boolean {
    return isChatModality(modelId);
  },

  async fetchModels(provider: ProviderWithConfig): Promise<SyncedModel[]> {
    const res = await fetchWithTimeout(
      `${getBaseUrl(provider)}/models`,
      { Authorization: `Bearer ${requireApiKey(provider)}` },
      provider,
    );
    if (!res.ok) throw new Error(`DeepSeek /models returned ${res.status}`);

    const json = await res.json();
    const rawModels = (json.data ?? []) as Array<{ id: string }>;

    return rawModels.map((m) => ({
      modelId: m.id,
      name: `deepseek/${m.id}`,
      displayName: m.id,
      modality: "TEXT" as const,
    }));
  },
};
