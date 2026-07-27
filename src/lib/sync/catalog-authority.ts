/**
 * BL-IMG-I2I-VISION F-IIV-09 — 「provider 的 /models 目录对某条通道是否具有权威性」
 * 的**唯一**判据。
 *
 * ## 为什么要有这个文件
 *
 * 系统里有两处会拿"realModelId 不在 provider /models 里"当作下架/不恢复的依据：
 *
 *   1. `model-sync.reconcile` 的 `toDisable` —— 目录里没有就 DISABLED
 *   2. `health/scheduler.vetoRecovery` —— 目录里没有就拒绝自动恢复
 *
 * 两边各自维护豁免规则，于是必然跑偏。生产实测：`seedream-4-5`（图生图首发模型）
 * 的 realModelId 是火山接入点 ID `ep-20260604162024-k2sbk`，按设计永不出现在
 * `/models` 中 —— `toDisable` 每轮把它下架，健康检查的 reachability 再把它恢复，
 * **来回对打 59 次**，通道长期处于随机的 DISABLED / ACTIVE 状态，直接挡住 i2i 验收。
 * （`vetoRecovery` 在 BL-DEEPSEEK-V4-HOTFIX 里已豁免接入点体系，`toDisable` 没跟上。）
 *
 * 把判据收敛到这里，两处共用，从结构上杜绝再次分叉。
 *
 * ## 判据
 *
 * 目录**不**权威（→ 不得据此下架或拒绝恢复）的情形：
 *
 * - **EMBEDDING 模态**：不通过 chat `/models` 同步，缺席是常态
 *   （原 `model-sync.ts` toDisable 已有此豁免，此处继承）
 * - **provider 使用接入点 ID 体系**：quirks 里配了 `endpointMap`，或声明了
 *   `model_can_be_endpoint_id` flag。此时 realModelId 与目录命名根本不是一套，
 *   比对无意义（火山即是：`{"flags":["model_can_be_endpoint_id",…],"endpointMap":{…}}`）
 *
 * 其余情形目录视为权威。
 *
 * ## 取舍
 *
 * 宁可漏判（退回"不下架/可恢复"的现状），不可误判 —— 误判会把还能正常调用的通道
 * 钉死。代价是这些 provider 下真正下线的模型需要人工下架。
 */

/** provider 声明"realModelId 可以直接是接入点 ID"的 quirks flag */
const ENDPOINT_ID_FLAG = "model_can_be_endpoint_id";

export interface CatalogAuthorityInput {
  /** 通道所属 model 的 modality */
  modality: string;
  /** ProviderConfig.quirks 原始 JSON */
  quirks: unknown;
}

/** provider 是否使用接入点 ID 体系（其 /models 命名与 realModelId 不可比） */
export function usesEndpointIdScheme(quirks: unknown): boolean {
  if (!quirks || typeof quirks !== "object") return false;
  const q = quirks as { endpointMap?: unknown; flags?: unknown };
  if (q.endpointMap && typeof q.endpointMap === "object") return true;
  return Array.isArray(q.flags) && q.flags.includes(ENDPOINT_ID_FLAG);
}

/**
 * provider 的 `/models` 目录能否作为"该通道模型是否还存在"的判据。
 *
 * @returns true = 目录权威，缺席即可判定下架；false = 不可据此下架/拒绝恢复
 */
export function isCatalogAuthoritative(input: CatalogAuthorityInput): boolean {
  if (input.modality === "EMBEDDING") return false;
  if (usesEndpointIdScheme(input.quirks)) return false;
  return true;
}
