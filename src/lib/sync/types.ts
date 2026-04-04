/**
 * 同步引擎共享类型定义
 */

import type { Provider, ProviderConfig } from "@prisma/client";

export type ProviderWithConfig = Provider & { config: ProviderConfig | null };

/** 服务商同步后返回的统一模型格式 */
export interface SyncedModel {
  /** 服务商原始 model ID（即 realModelId） */
  modelId: string;
  /** 统一命名：provider/model */
  name: string;
  /** 显示名称 */
  displayName: string;
  /** 模态 */
  modality: "TEXT" | "IMAGE" | "EMBEDDING" | "RERANKING" | "AUDIO";
  /** 上下文窗口 */
  contextWindow?: number;
  /** 最大输出 token */
  maxOutputTokens?: number;
  /** 输入价格（美元/百万 token） */
  inputPricePerM?: number;
  /** 输出价格（美元/百万 token） */
  outputPricePerM?: number;
  /** 模型能力标签 */
  capabilities?: string[];
}

/** pricingOverrides 中单条模型的覆盖定义 */
export interface PricingOverride {
  inputPricePerM?: number;
  outputPricePerM?: number;
  inputPriceCNYPerM?: number;
  outputPriceCNYPerM?: number;
  contextWindow?: number;
  maxOutputTokens?: number;
  displayName?: string;
  modality?: "text" | "image";
}

/** 同步适配器接口 */
export interface SyncAdapter {
  readonly providerName: string;
  fetchModels(provider: ProviderWithConfig): Promise<SyncedModel[]>;
  /** 可选：过滤 AI 提取的模型（如 OpenAI 白名单） */
  filterModel?(modelId: string): boolean;
}

/** AI 文档提取层接口 */
export interface DocEnricher {
  enrichFromDocs(
    provider: Provider,
    config: ProviderConfig,
    existingModels: SyncedModel[],
  ): Promise<SyncedModel[]>;
}
