/**
 * BL-IMG-I2I-VISION F-IIV-09 — 「目录权威性」判据回归。
 *
 * 事故：`model-sync.toDisable` 与 `health/scheduler.vetoRecovery` 各自维护豁免规则，
 * 于是跑偏。生产实测 `seedream-4-5`（图生图首发模型）的 realModelId 是火山接入点 ID
 * `ep-20260604162024-k2sbk`，按设计永不出现在 `/models` 中 —— sync 每轮下架它，
 * 健康检查 reachability 再恢复它，**来回对打 59 次**，通道长期随机 DISABLED/ACTIVE，
 * 直接挡住 i2i 验收。
 *
 * 判据收敛到 `isCatalogAuthoritative` 后，两处共用同一份规则。
 */
import { describe, it, expect } from "vitest";
import { isCatalogAuthoritative, usesEndpointIdScheme } from "../catalog-authority";

/** 生产实际的火山 quirks（2026-07-27 取自 provider_configs） */
const VOLCENGINE_QUIRKS = {
  flags: [
    "image_prefer_chat",
    "model_can_be_endpoint_id",
    "multi_size_retry",
    "no_charge_on_image_failure",
  ],
  endpointMap: {
    "seedream-4.5": "ep-m-20260317191503-tq55s",
    "deepseek-v3-ark": "ep-m-20260319074430-x26tm",
  },
};

describe("usesEndpointIdScheme", () => {
  it("识别火山的真实 quirks（endpointMap + model_can_be_endpoint_id）", () => {
    expect(usesEndpointIdScheme(VOLCENGINE_QUIRKS)).toBe(true);
  });

  it("只有 endpointMap 也算", () => {
    expect(usesEndpointIdScheme({ endpointMap: { a: "ep-1" } })).toBe(true);
  });

  it("只有 model_can_be_endpoint_id flag 也算", () => {
    expect(usesEndpointIdScheme({ flags: ["model_can_be_endpoint_id"] })).toBe(true);
  });

  it("无关 quirks / 空值不算", () => {
    expect(usesEndpointIdScheme({ flags: ["multi_size_retry"] })).toBe(false);
    expect(usesEndpointIdScheme({})).toBe(false);
    expect(usesEndpointIdScheme(null)).toBe(false);
    expect(usesEndpointIdScheme(undefined)).toBe(false);
    expect(usesEndpointIdScheme("not-an-object")).toBe(false);
  });
});

describe("isCatalogAuthoritative — 不权威（不得据此下架/拒绝恢复）", () => {
  it("接入点 ID 体系的 IMAGE 通道（seedream-4-5 事故本体）", () => {
    expect(
      isCatalogAuthoritative({ modality: "IMAGE", quirks: VOLCENGINE_QUIRKS }),
    ).toBe(false);
  });

  it("接入点 ID 体系的 TEXT 通道（doubao-pro-128k 同样受害）", () => {
    expect(isCatalogAuthoritative({ modality: "TEXT", quirks: VOLCENGINE_QUIRKS })).toBe(false);
  });

  it("EMBEDDING 不通过 chat /models 同步，缺席是常态", () => {
    expect(isCatalogAuthoritative({ modality: "EMBEDDING", quirks: null })).toBe(false);
  });
});

describe("isCatalogAuthoritative — 权威（缺席即可判定下架）", () => {
  it("普通 provider 的 TEXT 通道（DeepSeek 陈旧通道场景）", () => {
    expect(isCatalogAuthoritative({ modality: "TEXT", quirks: null })).toBe(true);
  });

  it("普通 provider 的 IMAGE 通道", () => {
    expect(isCatalogAuthoritative({ modality: "IMAGE", quirks: {} })).toBe(true);
  });

  it("配了无关 quirks 的 provider 仍然权威", () => {
    expect(
      isCatalogAuthoritative({ modality: "TEXT", quirks: { flags: ["multi_size_retry"] } }),
    ).toBe(true);
  });
});
