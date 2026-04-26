/**
 * BL-IMAGE-LOG-DISPLAY-FIX F-ILDF-01 — processImageResultAsync 集成测试。
 *
 * 按 v0.9.4 mock 层级铁律：从 prisma 边界 mock，让 summarizeImageUrl 真实
 * 跑 — 这是 spec § 3.1 #4 要求的"集成测试"。
 *
 * 验证：
 *   1) OR ~1MB base64 data URL → call_log.responseContent + responseSummary
 *      .original_urls 都被 strip 到 ≤ 200B 的 metadata 字符串
 *   2) volcengine seedream https URL → 透传不变
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const callLogCreateMock = vi.fn();
const txCreateMock = vi.fn();
const txQueryRawMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    callLog: { create: (a: unknown) => callLogCreateMock(a) },
    project: { findUnique: vi.fn().mockResolvedValue(null) },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        callLog: { create: (a: unknown) => txCreateMock(a) },
        $queryRaw: (...args: unknown[]) => txQueryRawMock(...args),
      }),
  },
}));

vi.mock("@/lib/notifications/triggers", () => ({
  checkAndSendBalanceLowAlert: vi.fn(),
}));

vi.mock("../rate-limit", () => ({
  recordTokenUsage: vi.fn(),
  recordSpending: vi.fn(),
}));

import { processImageResult } from "../post-process";
import type { RouteResult, ImageGenerationResponse } from "../../engine/types";

function makeOrTokenRoute(): RouteResult {
  return {
    channel: {
      id: "ch_or",
      costPrice: { unit: "token", inputPer1M: 0.3, outputPer1M: 2.5 },
      sellPrice: { unit: "token", inputPer1M: 0.36, outputPer1M: 3.0 },
    },
    alias: { alias: "google/gemini-2.5-flash-image", sellPrice: null },
    config: { currency: "USD" },
    model: { name: "google/gemini-2.5-flash-image", capabilities: null },
    provider: { name: "openrouter" },
  } as unknown as RouteResult;
}

function makeVolcCallRoute(): RouteResult {
  return {
    channel: {
      id: "ch_volc",
      costPrice: { unit: "call", perCall: 0.037 },
      sellPrice: { unit: "call", perCall: 0.0444 },
    },
    alias: { alias: "seedream-3.0", sellPrice: null },
    config: { currency: "USD" },
    model: { name: "seedream-3.0", capabilities: null },
    provider: { name: "volcengine" },
  } as unknown as RouteResult;
}

function flushAsync(): Promise<void> {
  return new Promise((r) => setImmediate(r));
}

beforeEach(() => {
  callLogCreateMock.mockReset();
  txCreateMock.mockReset();
  txQueryRawMock.mockReset();
  callLogCreateMock.mockResolvedValue({ id: "cl_test" });
  txCreateMock.mockResolvedValue({ id: "cl_test" });
  txQueryRawMock.mockResolvedValue([]);
});

describe("F-ILDF-01 processImageResultAsync base64 strip integration", () => {
  it("OR ~1MB base64 data URL → responseContent + original_urls metadata ≤ 200B", async () => {
    const fakeBase64 = "x".repeat(1024 * 1024 - 30); // ~1MB
    const dataUrl = `data:image/png;base64,${fakeBase64}`;
    const response: ImageGenerationResponse = {
      created: 0,
      data: [{ url: dataUrl }],
      usage: { prompt_tokens: 6, completion_tokens: 1290, total_tokens: 1296 },
    };

    processImageResult({
      traceId: "trc_strip_or",
      userId: "u1",
      projectId: "p1",
      route: makeOrTokenRoute(),
      modelName: "google/gemini-2.5-flash-image",
      promptSnapshot: [],
      requestParams: { prompt: "x" },
      startTime: Date.now() - 50,
      response,
      source: "api",
    });
    await flushAsync();

    // sellUsd > 0 → tx path
    const writeCall = txCreateMock.mock.calls[0] ?? callLogCreateMock.mock.calls[0];
    expect(writeCall).toBeDefined();
    const data = writeCall![0].data;

    // responseContent 不再是 1MB base64，而是 metadata
    expect(typeof data.responseContent).toBe("string");
    expect((data.responseContent as string).length).toBeLessThan(200);
    expect(data.responseContent).toMatch(/^\[image:png, \d+KB\]$/);

    // responseSummary.original_urls[0] 也被 strip
    const summary = data.responseSummary as Record<string, unknown>;
    const originalUrls = summary.original_urls as string[];
    expect(originalUrls).toHaveLength(1);
    expect(originalUrls[0]).toMatch(/^\[image:png, \d+KB\]$/);
    expect(originalUrls[0].length).toBeLessThan(200);
  });

  it("volcengine seedream https URL → pass-through unchanged", async () => {
    const httpsUrl =
      "https://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com/seedream/abc.jpeg?X-Tos-Signature=xxx";
    const response: ImageGenerationResponse = {
      created: 0,
      data: [{ url: httpsUrl }],
    };

    processImageResult({
      traceId: "trc_strip_volc",
      userId: "u1",
      projectId: "p1",
      route: makeVolcCallRoute(),
      modelName: "seedream-3.0",
      promptSnapshot: [],
      requestParams: { prompt: "x" },
      startTime: Date.now() - 50,
      response,
      source: "api",
    });
    await flushAsync();

    const writeCall = txCreateMock.mock.calls[0] ?? callLogCreateMock.mock.calls[0];
    expect(writeCall).toBeDefined();
    const data = writeCall![0].data;
    expect(data.responseContent).toBe(httpsUrl);
    const summary = data.responseSummary as Record<string, unknown>;
    expect((summary.original_urls as string[])[0]).toBe(httpsUrl);
  });

  it("idempotent: pre-stripped metadata string passes through unchanged", async () => {
    // 模拟 backfill 之后又触发 processImageResultAsync 的场景（不会发生
    // 但保证幂等性 — metadata 字符串不以 data: 开头，summarizeImageUrl
    // 直接 pass-through）
    const meta = "[image:png, 1024KB]";
    const response: ImageGenerationResponse = {
      created: 0,
      data: [{ url: meta }],
    };

    processImageResult({
      traceId: "trc_strip_meta",
      userId: "u1",
      projectId: "p1",
      route: makeVolcCallRoute(),
      modelName: "seedream-3.0",
      promptSnapshot: [],
      requestParams: { prompt: "x" },
      startTime: Date.now() - 50,
      response,
      source: "api",
    });
    await flushAsync();

    const writeCall = txCreateMock.mock.calls[0] ?? callLogCreateMock.mock.calls[0];
    expect(writeCall).toBeDefined();
    const data = writeCall![0].data;
    expect(data.responseContent).toBe(meta);
  });
});
