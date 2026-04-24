/**
 * BL-BILLING-AUDIT-EXT-P1 F-BAX-08 — IMAGE channel 定价校验单测。
 *
 * 修复 2026-04-24 生产事故（40 条 image channel 全体 costPrice.perCall=0）。
 * 后端 PATCH handler 用 validateChannelPriceForModality 做 IMAGE + perCall>0 硬性校验。
 */
import { describe, it, expect } from "vitest";
import {
  imageChannelPriceValid,
  validateChannelPriceForModality,
} from "../admin-schemas";

describe("F-BAX-08 imageChannelPriceValid", () => {
  it("accepts {unit:'call', perCall:0.01}", () => {
    expect(imageChannelPriceValid({ unit: "call", perCall: 0.01 })).toBe(true);
  });

  it("rejects {unit:'call', perCall:0}", () => {
    expect(imageChannelPriceValid({ unit: "call", perCall: 0 })).toBe(false);
  });

  it("rejects negative perCall", () => {
    expect(imageChannelPriceValid({ unit: "call", perCall: -0.01 })).toBe(false);
  });

  it("rejects {unit:'token'} shape", () => {
    expect(
      imageChannelPriceValid({ unit: "token", inputPer1M: 10, outputPer1M: 20 }),
    ).toBe(false);
  });

  it("rejects null / missing perCall", () => {
    expect(imageChannelPriceValid(null)).toBe(false);
    expect(imageChannelPriceValid({})).toBe(false);
    expect(imageChannelPriceValid({ unit: "call" })).toBe(false);
  });
});

describe("F-BAX-08 validateChannelPriceForModality", () => {
  it("IMAGE + perCall=0 rejected", () => {
    expect(
      validateChannelPriceForModality("IMAGE", { unit: "call", perCall: 0 }),
    ).toMatch(/perCall>0/);
  });

  it("IMAGE + perCall>0 passes", () => {
    expect(
      validateChannelPriceForModality("IMAGE", { unit: "call", perCall: 0.0286 }),
    ).toBeNull();
  });

  it("TEXT + perCall=0 passes (only IMAGE has the constraint)", () => {
    expect(
      validateChannelPriceForModality("TEXT", { unit: "call", perCall: 0 }),
    ).toBeNull();
  });

  it("IMAGE + undefined costPrice passes (not updating price)", () => {
    expect(validateChannelPriceForModality("IMAGE", undefined)).toBeNull();
  });

  it("IMAGE + sellPrice perCall=0 rejected", () => {
    expect(
      validateChannelPriceForModality(
        "IMAGE",
        { unit: "call", perCall: 0.01 },
        { unit: "call", perCall: 0 },
      ),
    ).toMatch(/sellPrice/);
  });

  it("AUDIO treated as non-IMAGE → passes", () => {
    expect(
      validateChannelPriceForModality("AUDIO", { unit: "call", perCall: 0 }),
    ).toBeNull();
  });
});
