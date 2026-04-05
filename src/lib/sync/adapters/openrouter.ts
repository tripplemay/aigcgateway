import type { SyncAdapter, SyncedModel, ProviderWithConfig } from "./base";
import { fetchWithTimeout, getApiKey, getBaseUrl, inferModality } from "./base";
import { isModelWhitelisted } from "../model-whitelist";

export const openrouterAdapter: SyncAdapter = {
  providerName: "openrouter",

  filterModel(modelId: string): boolean {
    return isModelWhitelisted("openrouter", modelId);
  },

  async fetchModels(provider: ProviderWithConfig): Promise<SyncedModel[]> {
    const res = await fetchWithTimeout(
      `${getBaseUrl(provider)}/models`,
      { Authorization: `Bearer ${getApiKey(provider)}` },
      provider,
    );
    if (!res.ok) throw new Error(`OpenRouter /models returned ${res.status}`);

    const json = await res.json();
    const rawModels = (json.data ?? []) as Array<{
      id: string;
      name?: string;
      context_length?: number;
      top_provider?: { max_completion_tokens?: number };
      pricing?: { prompt?: string; completion?: string };
      architecture?: { modality?: string };
    }>;

    return rawModels
      .filter((m) => {
        // 白名单过滤：只同步明确收录的主流模型
        if (!isModelWhitelisted("openrouter", m.id)) return false;
        // 排除免费模型（pricing 全为 0 或 "0"）
        if (m.pricing) {
          const prompt = parseFloat(m.pricing.prompt ?? "0");
          const completion = parseFloat(m.pricing.completion ?? "0");
          if (prompt === 0 && completion === 0) return false;
        }
        // 排除 id 中含 :free 的
        if (m.id.includes(":free")) return false;
        return true;
      })
      .map((m) => {
        // pricing 单位：美元/token → ×1000000 → 美元/百万token
        let inputPricePerM: number | undefined;
        let outputPricePerM: number | undefined;
        if (m.pricing) {
          const prompt = parseFloat(m.pricing.prompt ?? "0");
          const completion = parseFloat(m.pricing.completion ?? "0");
          if (prompt > 0 || completion > 0) {
            inputPricePerM = +(prompt * 1_000_000).toFixed(4);
            outputPricePerM = +(completion * 1_000_000).toFixed(4);
          }
        }

        return {
          modelId: m.id,
          name: `openrouter/${m.id}`,
          displayName: m.name ?? m.id,
          modality: inferModality(m.id),
          contextWindow: m.context_length,
          maxOutputTokens: m.top_provider?.max_completion_tokens,
          inputPricePerM,
          outputPricePerM,
        };
      });
  },
};
