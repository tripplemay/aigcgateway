/**
 * BL-BILLING-ZERO-PRICE-BACKFILL F-BZP-01 — openrouter 价目表匹配器（纯函数，可单测）。
 *
 * 把本地 channel 的模型标识匹配到 openrouter 目录里的模型，取其价格作**参考成本**。
 *
 * ## 口径（spec D2，必须随交付声明）
 *
 * openrouter 是**转售平台，其价格含自身渠道费**，而 qwen / siliconflow / deepseek
 * 直连通常更便宜。因此匹配出的价是**参考值且系统性偏高**，毛利报表会偏悲观。
 * 它不改变任何用户扣费，仅影响成本侧与对账。
 *
 * ## 为什么"宁缺毋滥"（spec D3）
 *
 * 错配污染成本数据比留着 0 更糟：0 至少是"已知的未知"，而一个错的价会让毛利报表
 * 看起来正常、掩盖真实亏损。所以这里的规则一律偏保守：
 *
 *   - 短名匹配**要求 openrouter 侧唯一命中**，多候选一律跳过（不做"任选第一个"）
 *   - 版本号天然是短名的一部分，键的完全相等即保证版本相等：
 *     本地 `deepseek-v3` 查不到 `deepseek-v3.2` 这个键，只会落到 no_openrouter_match
 *   - openrouter 侧 prompt 与 completion 均为 0（`:free` 变体）视为无价，跳过
 *   - 任何跳过都带原因返回，交由调用方打进报告，**不得静默丢弃**
 */

/** openrouter /api/v1/models 的单条目（只取用得上的字段） */
export interface OpenRouterModel {
  id: string;
  name?: string;
  pricing?: { prompt?: string; completion?: string };
}

export interface TokenPrice {
  inputPer1M: number;
  outputPer1M: number;
}

export type SkipReason =
  | "no_openrouter_match"
  | "ambiguous_short_name"
  | "openrouter_price_zero";

export interface MatchResult {
  matched: boolean;
  openRouterId?: string;
  price?: TokenPrice;
  reason?: SkipReason;
  /** 歧义时列出候选，便于人工判读 */
  candidates?: string[];
}

/** 变体后缀：openrouter 用 `:free` / `:beta` 等标注同一模型的不同供给 */
const VARIANT_SUFFIX = /:(free|beta|extended|thinking|nitro|floor|online|batch)$/;

export function normalize(raw: string): string {
  let s = raw.toLowerCase().trim();
  s = s.replace(VARIANT_SUFFIX, "");
  s = s.replace(/[\s_]+/g, "-");
  return s;
}

/**
 * 日期后缀的三种写法互转：`2026-04-20` / `20260420` / `04-20`。
 *
 * 本地库存的是 `qwen3.5-plus-2026-04-20`，openrouter 上却是
 * `qwen/qwen3.5-plus-20260420` 与 `qwen/qwen3.5-plus-02-15` 并存 —— 光靠朴素
 * 归一化对不上，qwen 187 条里有相当一部分卡在这里。
 */
export function dateVariants(s: string): string[] {
  const out = new Set<string>([s]);
  // 2026-04-20 → 20260420 / 04-20
  const full = s.match(/(\d{4})-(\d{2})-(\d{2})$/);
  if (full) {
    const [, y, m, d] = full;
    const base = s.slice(0, full.index);
    out.add(`${base}${y}${m}${d}`);
    out.add(`${base}${m}-${d}`);
  }
  // 20260420 → 2026-04-20 / 04-20
  const compact = s.match(/(\d{4})(\d{2})(\d{2})$/);
  if (compact) {
    const [, y, m, d] = compact;
    const base = s.slice(0, compact.index);
    out.add(`${base}${y}-${m}-${d}`);
    out.add(`${base}${m}-${d}`);
  }
  return [...out];
}

/** 生成一个本地标识的全部候选键（含去 vendor 前缀、去 `pro/` 前缀、日期变体） */
export function candidateKeys(raw: string): string[] {
  const out = new Set<string>();
  const push = (s: string) => dateVariants(s).forEach((v) => out.add(v));

  const n = normalize(raw);
  push(n);

  // siliconflow 的 `pro/deepseek-ai/deepseek-r1` —— 剥掉 pro/ 再取短名
  const noPro = n.replace(/^pro\//, "");
  push(noPro);

  // 去 vendor 前缀取短名：`deepseek-ai/deepseek-r1` → `deepseek-r1`
  for (const v of [n, noPro]) {
    const idx = v.lastIndexOf("/");
    if (idx > 0) push(v.slice(idx + 1));
  }
  return [...out];
}

export interface PriceIndex {
  byId: Map<string, OpenRouterModel>;
  byShort: Map<string, OpenRouterModel[]>;
}

/** 原始 id 是否带变体后缀（`:batch` / `:free` ...） */
function isVariant(m: OpenRouterModel): boolean {
  return VARIANT_SUFFIX.test(m.id.toLowerCase().trim());
}

export function buildIndex(models: OpenRouterModel[]): PriceIndex {
  const byId = new Map<string, OpenRouterModel>();
  // 同一 normalized id 只保留一条：优先无变体后缀的那个。
  //
  // 否则 `openai/gpt-5.4` 与 `openai/gpt-5.4:batch` 会归一化成同一个 id、在短名索引里
  // 变成"两个候选"，触发 ambiguous_short_name 而被跳过 —— 但它们本就是同一个模型，
  // 只是供给方式不同。生产上 guangtech 的 gpt-5.4 / gpt-5.5 正是卡在这个假歧义上，
  // 而那两条恰恰是本批次最要紧的（既零成本又是漏费源头）。
  const canonical = new Map<string, OpenRouterModel>();
  for (const m of models) {
    const id = normalize(m.id);
    const prev = canonical.get(id);
    if (!prev || (isVariant(prev) && !isVariant(m))) canonical.set(id, m);
  }

  const byShort = new Map<string, OpenRouterModel[]>();
  for (const [id, m] of canonical) {
    byId.set(id, m);
    const idx = id.lastIndexOf("/");
    const short = idx > 0 ? id.slice(idx + 1) : id;
    const list = byShort.get(short) ?? [];
    list.push(m);
    byShort.set(short, list);
  }
  return { byId, byShort };
}

function toTokenPrice(m: OpenRouterModel): TokenPrice | null {
  const i = Number(m.pricing?.prompt);
  const o = Number(m.pricing?.completion);
  if (!Number.isFinite(i) || !Number.isFinite(o)) return null;
  const price = {
    inputPer1M: Math.round(i * 1_000_000 * 1e6) / 1e6,
    outputPer1M: Math.round(o * 1_000_000 * 1e6) / 1e6,
  };
  if (price.inputPer1M === 0 && price.outputPer1M === 0) return null;
  return price;
}

/**
 * 用一组本地标识（realModelId / model.name）去匹配 openrouter。
 * 返回 matched=false 时 reason 必有值，供调用方写进报告。
 */
export function matchPrice(localIds: string[], index: PriceIndex): MatchResult {
  const keys: string[] = [];
  for (const id of localIds) keys.push(...candidateKeys(id));

  // ── 1. 精确 id 命中优先 ──
  for (const k of keys) {
    const hit = index.byId.get(k);
    if (hit) {
      const price = toTokenPrice(hit);
      return price
        ? { matched: true, openRouterId: hit.id, price }
        : { matched: false, reason: "openrouter_price_zero", openRouterId: hit.id };
    }
  }

  // ── 2. 短名命中，要求唯一 ──
  //
  // 版本号天然是短名的一部分（`deepseek-v3` vs `deepseek-v3.2` 是两个不同的键），
  // 所以"版本必须相等"这条约束由**键的完全相等**本身保证 —— 无需额外判版本。
  // 这也意味着 `deepseek-v3` 只会落到 no_openrouter_match，绝不会错配到 v3.2。
  for (const k of keys) {
    const list = index.byShort.get(k);
    if (!list || list.length === 0) continue;

    if (list.length > 1) {
      return {
        matched: false,
        reason: "ambiguous_short_name",
        candidates: list.map((m) => m.id),
      };
    }

    const hit = list[0];
    const price = toTokenPrice(hit);
    return price
      ? { matched: true, openRouterId: hit.id, price }
      : { matched: false, reason: "openrouter_price_zero", openRouterId: hit.id };
  }

  return { matched: false, reason: "no_openrouter_match" };
}
