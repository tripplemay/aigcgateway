import type { SyncAdapter, SyncedModel, ProviderWithConfig } from "./base";
import { inferModality, isChatModality } from "./base";

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

  filterModel(modelId: string): boolean {
    return isChatModality(modelId);
  },

  async fetchModels(provider: ProviderWithConfig): Promise<SyncedModel[]> {
    // 火山引擎不支持 /models API，完全从 staticModels 读取。
    // 注意：火山引擎 channel 的 realModelId 必须设置为推理接入点 (endpoint) ID
    // （格式 ep-xxxx），而非模型名称。管理员在 admin 控制台创建 channel 时需要
    // 手动填写 endpoint ID。fetchModels 返回的 model name 仅用于显示和别名匹配。
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
