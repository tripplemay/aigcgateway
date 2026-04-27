/**
 * F-BAP2-02 classifyTier / classifyStatus 单测（铁律 1.3 阈值边界）。
 *
 * BL-RECON-UX-PHASE1 F-RC-01c 扩展：classifyStatus 支持 thresholds 参数；
 * 默认参数行为必须与原硬编码完全一致（回归保护）。
 */
import { describe, it, expect } from "vitest";
import {
  classifyTier,
  classifyStatus,
  DEFAULT_THRESHOLDS,
  type ReconThresholds,
} from "../reconcile-job";

describe("F-BAP2-02 classifyTier", () => {
  it("classifies tier 1 providers (volcengine / openrouter / openai-CAW)", () => {
    expect(classifyTier("volcengine")).toBe(1);
    expect(classifyTier("openrouter")).toBe(1);
    expect(classifyTier("openai")).toBe(1);
  });

  it("classifies tier 2 providers (deepseek / siliconflow)", () => {
    expect(classifyTier("deepseek")).toBe(2);
    expect(classifyTier("siliconflow")).toBe(2);
  });

  it("classifies tier 3 (everything else, decision D1 — skip)", () => {
    expect(classifyTier("zhipu")).toBe(3);
    expect(classifyTier("minimax")).toBe(3);
    expect(classifyTier("qwen")).toBe(3);
    expect(classifyTier("xiaomi-mimo")).toBe(3);
    expect(classifyTier("stepfun")).toBe(3);
    expect(classifyTier("moonshot")).toBe(3);
  });
});

describe("F-BAP2-02 classifyStatus boundary cases (铁律 1.3)", () => {
  it("|delta|<0.5 → MATCH regardless of percent", () => {
    expect(classifyStatus(0, 0)).toBe("MATCH");
    expect(classifyStatus(0.49, 100)).toBe("MATCH");
    expect(classifyStatus(-0.49, -100)).toBe("MATCH");
  });

  it("|delta|=0.5 → not MATCH (strict <)", () => {
    // delta=0.5 exact 不满足 < 0.5；deltaPercent 也不满足 < 5（=5 边界）
    // 0.5 / 100 = 0.5%，<5 → MATCH（按百分比）
    // 设计 upstream=100, gateway=100.5, |%|=0.5 → MATCH
    expect(classifyStatus(0.5, 0.5)).toBe("MATCH");
    // 但 delta=0.5 + |%|=5 边界 → 不 MATCH（=5 严格 <）
    expect(classifyStatus(0.5, 5)).toBe("MINOR_DIFF");
  });

  it("|%|<5 → MATCH (overrides delta)", () => {
    expect(classifyStatus(4, 4.99)).toBe("MATCH");
    expect(classifyStatus(-4, -4.99)).toBe("MATCH");
  });

  it("|%|=5 exact → not MATCH", () => {
    // delta=4 < 5, |%|=5 → MINOR_DIFF (NOT MATCH because 5 is not < 5)
    expect(classifyStatus(4, 5)).toBe("MINOR_DIFF");
  });

  it("|delta|<5 AND |%|<20 → MINOR_DIFF", () => {
    expect(classifyStatus(2, 10)).toBe("MINOR_DIFF");
    expect(classifyStatus(4.99, 19.99)).toBe("MINOR_DIFF");
  });

  it("|delta|>=5 → BIG_DIFF (when percent does not trigger MATCH)", () => {
    expect(classifyStatus(5, 10)).toBe("BIG_DIFF");
    expect(classifyStatus(-5, -10)).toBe("BIG_DIFF");
    expect(classifyStatus(100, 50)).toBe("BIG_DIFF");
  });

  it("|delta|>=5 BUT |%|<5 → MATCH wins (percent overrides large delta)", () => {
    // 真实场景：upstream=200, gateway=205 → delta=5, |%|=2.5 → MATCH
    expect(classifyStatus(5, 2.5)).toBe("MATCH");
    // 假设 upstream=10000, gateway=10004 → delta=4 not enough; delta=10 percent=0.1
    expect(classifyStatus(10, 0.1)).toBe("MATCH");
  });

  it("|%|>=20 → BIG_DIFF (even with small delta)", () => {
    expect(classifyStatus(2, 20)).toBe("BIG_DIFF");
    expect(classifyStatus(2, 25)).toBe("BIG_DIFF");
  });

  it("deltaPercent=null (upstream=0) — falls through to delta-only check", () => {
    // upstream=0, gateway=4 → delta=4, percent=null → MINOR_DIFF
    expect(classifyStatus(4, null)).toBe("MINOR_DIFF");
    // upstream=0, gateway=10 → delta=10, percent=null → BIG_DIFF
    expect(classifyStatus(10, null)).toBe("BIG_DIFF");
    // upstream=0, gateway=0.3 → delta<0.5 → MATCH
    expect(classifyStatus(0.3, null)).toBe("MATCH");
  });
});

describe("F-RC-01c classifyStatus with configurable thresholds", () => {
  it("DEFAULT_THRESHOLDS values match the original hardcoded boundaries (回归保护)", () => {
    expect(DEFAULT_THRESHOLDS).toEqual({
      matchDeltaUsd: 0.5,
      matchPercent: 5,
      minorDeltaUsd: 5,
      minorPercent: 20,
    });
  });

  it("explicit DEFAULT_THRESHOLDS produces identical result to omitted argument", () => {
    expect(classifyStatus(0.3, 100, DEFAULT_THRESHOLDS)).toBe(classifyStatus(0.3, 100));
    expect(classifyStatus(2, 10, DEFAULT_THRESHOLDS)).toBe(classifyStatus(2, 10));
    expect(classifyStatus(100, 50, DEFAULT_THRESHOLDS)).toBe(classifyStatus(100, 50));
  });

  it("tighter matchDeltaUsd shrinks the MATCH zone", () => {
    // delta=0.3, percent=100 → with default 0.3<0.5 → MATCH
    // with matchDeltaUsd=0.1: 0.3>=0.1 AND |%|>=matchPercent(5) → not MATCH;
    //   ad=0.3<minorDeltaUsd(5) AND ap=100 NOT < minorPercent(20) → BIG_DIFF
    const tight: ReconThresholds = { ...DEFAULT_THRESHOLDS, matchDeltaUsd: 0.1 };
    expect(classifyStatus(0.3, 100, DEFAULT_THRESHOLDS)).toBe("MATCH");
    expect(classifyStatus(0.3, 100, tight)).toBe("BIG_DIFF");
  });

  it("tighter matchDeltaUsd may flip MATCH to MINOR_DIFF when percent within minor zone", () => {
    // delta=0.3, percent=10 → default MATCH (delta<0.5)
    // tight matchDeltaUsd=0.1, percent=10 → not MATCH (0.3>=0.1 AND |%|=10>=5);
    //   ad=0.3<5 AND ap=10<20 → MINOR_DIFF
    const tight: ReconThresholds = { ...DEFAULT_THRESHOLDS, matchDeltaUsd: 0.1 };
    expect(classifyStatus(0.3, 10, DEFAULT_THRESHOLDS)).toBe("MATCH");
    expect(classifyStatus(0.3, 10, tight)).toBe("MINOR_DIFF");
  });

  it("relaxed matchDeltaUsd promotes previously MINOR/BIG to MATCH", () => {
    // delta=4, percent=10 → default MINOR_DIFF
    // relaxed matchDeltaUsd=10, percent=10 → MATCH (delta<10)
    const relaxed: ReconThresholds = { ...DEFAULT_THRESHOLDS, matchDeltaUsd: 10 };
    expect(classifyStatus(4, 10, DEFAULT_THRESHOLDS)).toBe("MINOR_DIFF");
    expect(classifyStatus(4, 10, relaxed)).toBe("MATCH");
  });

  it("matchPercent threshold is honored", () => {
    // delta=10 (above matchDeltaUsd default 0.5), percent=3 → MATCH (|%|<5)
    // tighter matchPercent=1 → no match by percent; ad=10>=minorDeltaUsd(5) → BIG_DIFF
    const tight: ReconThresholds = { ...DEFAULT_THRESHOLDS, matchPercent: 1 };
    expect(classifyStatus(10, 3, DEFAULT_THRESHOLDS)).toBe("MATCH");
    expect(classifyStatus(10, 3, tight)).toBe("BIG_DIFF");
  });

  it("minorPercent threshold is honored", () => {
    // delta=2, percent=15 → default MINOR_DIFF (15<20)
    // tighter minorPercent=10 → not minor; ad=2<minorDeltaUsd(5) but ap=15 NOT < 10 → BIG_DIFF
    const tight: ReconThresholds = { ...DEFAULT_THRESHOLDS, minorPercent: 10 };
    expect(classifyStatus(2, 15, DEFAULT_THRESHOLDS)).toBe("MINOR_DIFF");
    expect(classifyStatus(2, 15, tight)).toBe("BIG_DIFF");
  });

  it("minorDeltaUsd threshold is honored", () => {
    // delta=4, percent=15 → default MINOR_DIFF
    // tighter minorDeltaUsd=1 → ad=4 NOT < 1 → BIG_DIFF
    const tight: ReconThresholds = { ...DEFAULT_THRESHOLDS, minorDeltaUsd: 1 };
    expect(classifyStatus(4, 15, DEFAULT_THRESHOLDS)).toBe("MINOR_DIFF");
    expect(classifyStatus(4, 15, tight)).toBe("BIG_DIFF");
  });
});
