/**
 * BL-IMAGE-PRICING-OR-P2 F-BIPOR-04 — model-sync buildCostPrice 回归保护单测。
 *
 * 裁决文档：docs/adjudications/2026-04-25-or-p2-buildcostprice-regression.md
 *
 * R1 修复语义：
 *   - 存量 IMAGE channel sync 时跳过 costPrice 写入（buildCostPrice 返回 null
 *     → 调用处省略 costPrice 字段，保留运营手设值）
 *   - 新建 IMAGE channel 仍用 buildInitialCostPrice 写默认 {perCall:0,unit:'call'}
 *   - TEXT 路径不变：按 token 公式更新
 *
 * 本测覆盖 buildCostPrice / buildInitialCostPrice 两个 helper（直接单测），
 * 配合 docs/adjudications acceptance #12 在生产 sync 跑后做集成回归验证。
 */
import { describe, it, expect } from "vitest";
import { __testing } from "../model-sync";
import type { SyncedModel } from "../types";

const { buildCostPrice, buildInitialCostPrice } = __testing;

function image(name: string): SyncedModel {
  return {
    modelId: name,
    name,
    displayName: name,
    modality: "IMAGE",
  };
}

function text(name: string, input = 0.3, output = 2.5): SyncedModel {
  return {
    modelId: name,
    name,
    displayName: name,
    modality: "TEXT",
    inputPricePerM: input,
    outputPricePerM: output,
  };
}

describe("F-BIPOR-04 buildCostPrice regression fix (R1)", () => {
  it("IMAGE → null (R1: skip costPrice write so existing operator-set value is preserved)", () => {
    expect(buildCostPrice(image("openai/gpt-5-image"))).toBeNull();
    expect(buildCostPrice(image("google/gemini-2.5-flash-image"))).toBeNull();
  });

  it("TEXT → token unit with input/output per million (unchanged behavior)", () => {
    const r = buildCostPrice(text("deepseek-chat", 0.14, 0.28));
    expect(r).toEqual({ unit: "token", inputPer1M: 0.14, outputPer1M: 0.28 });
  });

  it("TEXT with missing pricing → 0 fallback (unchanged behavior)", () => {
    const r = buildCostPrice({
      modelId: "x",
      name: "x",
      displayName: "x",
      modality: "TEXT",
    });
    expect(r).toEqual({ unit: "token", inputPer1M: 0, outputPer1M: 0 });
  });

  it("AUDIO / EMBEDDING / RERANKING fall through to token path (existing behavior preserved)", () => {
    expect(buildCostPrice({ modelId: "a", name: "a", displayName: "a", modality: "AUDIO" })).toEqual(
      { unit: "token", inputPer1M: 0, outputPer1M: 0 },
    );
    expect(
      buildCostPrice({ modelId: "e", name: "e", displayName: "e", modality: "EMBEDDING" }),
    ).toEqual({ unit: "token", inputPer1M: 0, outputPer1M: 0 });
  });
});

describe("F-BIPOR-04 buildInitialCostPrice (used by createMany for new channels)", () => {
  it("IMAGE → {unit:'call', perCall:0} placeholder; trigger guards subsequent UPDATE", () => {
    expect(buildInitialCostPrice(image("openai/gpt-5-image"))).toEqual({
      unit: "call",
      perCall: 0,
    });
  });

  it("TEXT → token unit with input/output (same as buildCostPrice for non-IMAGE)", () => {
    const r = buildInitialCostPrice(text("gpt-4o", 1, 2));
    expect(r).toEqual({ unit: "token", inputPer1M: 1, outputPer1M: 2 });
  });
});

describe("F-BIPOR-04 contract — IMAGE update path uses buildCostPrice (returns null), createMany uses buildInitialCostPrice", () => {
  it("invariant: buildCostPrice IMAGE always null; buildInitialCostPrice IMAGE always {perCall:0,unit:'call'}", () => {
    // explicit invariant restating R1 contract — the two helpers are NOT
    // interchangeable: update path must use null sentinel to skip the
    // overwrite; createMany path must always supply a default value.
    const m = image("seedream-3.0");
    expect(buildCostPrice(m)).toBeNull();
    expect(buildInitialCostPrice(m)).toEqual({ unit: "call", perCall: 0 });
  });
});
