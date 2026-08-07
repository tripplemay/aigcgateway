/**
 * BL-BILLING-ZERO-PRICE-BACKFILL F-BZP-01 — 价目表匹配器的保守性回归。
 *
 * 这些用例守的是一条判断：**错配比留着 0 更糟**。0 至少是"已知的未知"，
 * 而一个错的成本价会让毛利报表看起来正常、掩盖真实亏损。所以匹配器的每一条
 * 规则都偏保守，而这里逐条钉住它们不被后人"优化"掉。
 */
import { describe, it, expect } from "vitest";
import {
  buildIndex,
  matchPrice,
  normalize,
  dateVariants,
  candidateKeys,
  type OpenRouterModel,
} from "../openrouter-price-match";

const M = (id: string, prompt: string, completion: string): OpenRouterModel => ({
  id,
  pricing: { prompt, completion },
});

describe("normalize / dateVariants / candidateKeys", () => {
  it("剥离变体后缀并统一分隔符", () => {
    expect(normalize("OpenAI/GPT-5.4:batch")).toBe("openai/gpt-5.4");
    expect(normalize("qwen/Qwen3_5 Plus")).toBe("qwen/qwen3-5-plus");
  });

  it("日期后缀三种写法互相产出", () => {
    const v = dateVariants("qwen3.5-plus-2026-04-20");
    expect(v).toContain("qwen3.5-plus-20260420");
    expect(v).toContain("qwen3.5-plus-04-20");
  });

  it("候选键含去 vendor 前缀与去 pro/ 前缀的形式", () => {
    const k = candidateKeys("pro/deepseek-ai/deepseek-r1");
    expect(k).toContain("deepseek-ai/deepseek-r1");
    expect(k).toContain("deepseek-r1");
  });
});

describe("版本号必须完全相等（错配防线）", () => {
  const index = buildIndex([M("deepseek/deepseek-v3.2", "0.000000269", "0.0000004")]);

  // 版本号天然是短名的一部分，所以这条防线由"键完全相等"本身提供 ——
  // 无需额外的版本比较逻辑（那样反而是一段永不触发的死代码）。
  it("deepseek-v3 不得匹配到 deepseek-v3.2 —— 两者价差可达数倍", () => {
    const r = matchPrice(["deepseek-v3"], index);
    expect(r.matched).toBe(false);
    expect(r.reason).toBe("no_openrouter_match");
  });

  it("版本号相等则正常匹配", () => {
    const r = matchPrice(["deepseek-v3.2"], index);
    expect(r.matched).toBe(true);
    expect(r.price).toEqual({ inputPer1M: 0.269, outputPer1M: 0.4 });
  });
});

describe("短名多候选一律跳过，不做任选", () => {
  const index = buildIndex([
    M("vendor-a/mystery-model", "0.000001", "0.000002"),
    M("vendor-b/mystery-model", "0.000009", "0.000009"),
  ]);

  it("两个 vendor 提供同名模型时跳过并列出候选", () => {
    const r = matchPrice(["mystery-model"], index);
    expect(r.matched).toBe(false);
    expect(r.reason).toBe("ambiguous_short_name");
    expect(r.candidates).toHaveLength(2);
  });
});

describe("变体后缀不构成歧义（本批次的实际卡点）", () => {
  // 生产上 guangtech 的 gpt-5.4 / gpt-5.5 曾因这个假歧义被跳过，
  // 而它们恰是既零成本又是漏费源头的两条。
  const index = buildIndex([
    M("openai/gpt-5.4", "0.0000025", "0.000015"),
    M("openai/gpt-5.4:batch", "0.00000125", "0.0000075"),
  ]);

  it("同一模型的 :batch 变体不算第二个候选，且取非变体那条的价", () => {
    const r = matchPrice(["gpt-5.4"], index);
    expect(r.matched).toBe(true);
    expect(r.openRouterId).toBe("openai/gpt-5.4");
    expect(r.price).toEqual({ inputPer1M: 2.5, outputPer1M: 15 });
  });
});

describe("openrouter 侧无价时不落库", () => {
  const index = buildIndex([M("inclusionai/ling-3.0-tiny:free", "0", "0")]);

  it(":free 变体价格为 0 → 跳过而不是写 0", () => {
    const r = matchPrice(["ling-3.0-tiny"], index);
    expect(r.matched).toBe(false);
    expect(r.reason).toBe("openrouter_price_zero");
  });
});

describe("完全没有对应模型", () => {
  it("返回 no_openrouter_match 而不是抛异常", () => {
    const r = matchPrice(["tencent/hunyuan-mt-7b"], buildIndex([M("openai/gpt-5.4", "1", "1")]));
    expect(r.matched).toBe(false);
    expect(r.reason).toBe("no_openrouter_match");
  });
});

describe("日期格式差异可跨过（qwen 的实际卡点）", () => {
  const index = buildIndex([M("qwen/qwen3.5-plus-20260420", "0.0000004", "0.0000012")]);

  it("本地 qwen3.5-plus-2026-04-20 能匹配 OR 的压缩日期写法", () => {
    const r = matchPrice(["qwen3.5-plus-2026-04-20"], index);
    expect(r.matched).toBe(true);
    expect(r.price).toEqual({ inputPer1M: 0.4, outputPer1M: 1.2 });
  });
});
