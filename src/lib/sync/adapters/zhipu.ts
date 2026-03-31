import type { SyncAdapter, SyncedModel, ProviderWithConfig } from "./base";
import { fetchWithTimeout, getApiKey, getBaseUrl, getPricingOverride, inferModality } from "./base";

const EXCHANGE_RATE = parseFloat(process.env.EXCHANGE_RATE_CNY_TO_USD ?? "0.137");

export const zhipuAdapter: SyncAdapter = {
  providerName: "zhipu",

  async fetchModels(provider: ProviderWithConfig): Promise<SyncedModel[]> {
    const res = await fetchWithTimeout(
      `${getBaseUrl(provider)}/models`,
      { Authorization: `Bearer ${getApiKey(provider)}` },
      provider,
    );
    if (!res.ok) throw new Error(`Zhipu /models returned ${res.status}`);

    const json = await res.json();
    const rawModels = (json.data ?? []) as Array<{ id: string }>;

    return rawModels.map((m) => {
      const override = getPricingOverride(provider.config, m.id);
      const modality = override?.modality === "image" ? "IMAGE" as const : inferModality(m.id);

      // 人民币价格转美元
      let inputPricePerM = override?.inputPricePerM;
      let outputPricePerM = override?.outputPricePerM;
      if (inputPricePerM === undefined && override?.inputPriceCNYPerM !== undefined) {
        inputPricePerM = +(override.inputPriceCNYPerM * EXCHANGE_RATE).toFixed(4);
      }
      if (outputPricePerM === undefined && override?.outputPriceCNYPerM !== undefined) {
        outputPricePerM = +(override.outputPriceCNYPerM * EXCHANGE_RATE).toFixed(4);
      }

      return {
        modelId: m.id,
        name: `zhipu/${m.id}`,
        displayName: override?.displayName ?? m.id,
        modality,
        contextWindow: override?.contextWindow,
        maxOutputTokens: override?.maxOutputTokens,
        inputPricePerM,
        outputPricePerM,
      };
    });
  },
};
