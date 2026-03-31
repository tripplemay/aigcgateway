import type { SyncAdapter, SyncedModel, ProviderWithConfig } from "./base";
import { inferModality } from "./base";

const EXCHANGE_RATE = parseFloat(process.env.EXCHANGE_RATE_CNY_TO_USD ?? "0.137");

interface StaticModelDef {
  id: string;
  displayName?: string;
  name?: string;
  modality?: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  inputPriceCNYPerM?: number;
  outputPriceCNYPerM?: number;
  inputPricePerM?: number;
  outputPricePerM?: number;
}

export const volcengineAdapter: SyncAdapter = {
  providerName: "volcengine",

  async fetchModels(provider: ProviderWithConfig): Promise<SyncedModel[]> {
    // 火山引擎不支持 /models API，完全从 staticModels 读取
    const staticModels = provider.config?.staticModels;
    if (!Array.isArray(staticModels)) return [];

    return (staticModels as unknown as StaticModelDef[]).map((m) => {
      const modality =
        m.modality?.toUpperCase() === "IMAGE" ? ("IMAGE" as const) : inferModality(m.id);

      let inputPricePerM = m.inputPricePerM;
      let outputPricePerM = m.outputPricePerM;
      if (inputPricePerM === undefined && m.inputPriceCNYPerM !== undefined) {
        inputPricePerM = +(m.inputPriceCNYPerM * EXCHANGE_RATE).toFixed(4);
      }
      if (outputPricePerM === undefined && m.outputPriceCNYPerM !== undefined) {
        outputPricePerM = +(m.outputPriceCNYPerM * EXCHANGE_RATE).toFixed(4);
      }

      return {
        modelId: m.id,
        name: `volcengine/${m.id}`,
        displayName: m.displayName ?? m.name ?? m.id,
        modality,
        contextWindow: m.contextWindow,
        maxOutputTokens: m.maxOutputTokens,
        inputPricePerM,
        outputPricePerM,
      };
    });
  },
};
