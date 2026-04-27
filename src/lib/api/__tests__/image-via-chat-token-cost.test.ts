/**
 * BL-IMAGE-PRICING-OR-P2 fix_round 2 (Path A #2) — processImageResultAsync
 * 走 token 计价路径单测。
 *
 * 修复背景：Codex reverify 2026-04-25 发现 google/gemini-2.5-flash-image
 * smoke HTTP 200 但 call_log.costPrice=0 / promptTokens=null。根因：image
 * 路径之前永远走 calculateCallCost（perCall 计价），token-priced channel
 * 自然算 0；usage 也没从 chat 透到 ImageGenerationResponse。
 *
 * R 修复（最外层 mock 层级铁律）：
 *   - ImageGenerationResponse 加 usage?: Usage
 *   - imageViaChat 5 个 return 路径全部 propagate result.usage
 *   - processImageResultAsync 据 channel.costPrice.unit 分支：'token'
 *     → calculateTokenCost；'call' → 旧 calculateCallCost
 *
 * 本测试从 prisma.callLog mock 边界断言写入 call_log 字段：
 *   1) Token-priced channel + image-via-chat usage → cost = 公式匹配，
 *      promptTokens/completionTokens/totalTokens 写入
 *   2) Token-priced channel + 缺 usage → cost=0（不抛错）+ promptTokens=null
 *   3) Per-call channel (legacy seedream) + ignores upstream usage → 旧
 *      calculateCallCost 行为保留
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const callLogCreateMock = vi.fn();
const txCreateMock = vi.fn();
const txQueryRawMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    callLog: {
      create: (a: unknown) => callLogCreateMock(a),
    },
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
import type { RouteResult, ImageGenerationResponse, Usage } from "../../engine/types";

function makeRoute(costPrice: unknown, sellPrice: unknown): RouteResult {
  return {
    channel: { id: "ch_x", costPrice, sellPrice },
    alias: { alias: "test-alias", sellPrice },
    config: { currency: "USD" },
    model: { name: "test-model", capabilities: null },
    provider: { name: "openrouter" },
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

describe("F-BIPOR-Path-A image-via-chat token-priced cost", () => {
  it("token-priced channel + usage → cost = (prompt × inputPer1M + completion × outputPer1M) / 1e6", async () => {
    // gemini-2.5-flash-image 真实定价 0.30 / 2.50 USD per 1M
    const route = makeRoute(
      { unit: "token", inputPer1M: 0.3, outputPer1M: 2.5 },
      { unit: "token", inputPer1M: 0.36, outputPer1M: 3.0 }, // ×1.2
    );
    const usage: Usage = {
      prompt_tokens: 1000,
      completion_tokens: 500,
      total_tokens: 1500,
    };
    const response: ImageGenerationResponse = {
      created: 0,
      data: [{ url: "data:image/png;base64,xx" }],
      usage,
    };

    processImageResult({
      traceId: "trc_test_token",
      userId: "u1",
      projectId: "p1",
      route,
      modelName: "google/gemini-2.5-flash-image",
      promptSnapshot: [],
      requestParams: { prompt: "a small green dot" },
      startTime: Date.now() - 50,
      response,
      source: "api",
    });
    await flushAsync();

    // sellUsd>0 → 走 transaction 路径（tx.callLog.create + deductBalance）
    const writeCall = txCreateMock.mock.calls[0] ?? callLogCreateMock.mock.calls[0];
    expect(writeCall).toBeDefined();
    const data = writeCall![0].data;
    // 1000×0.3/1e6 + 500×2.5/1e6 = 0.0003 + 0.00125 = 0.00155
    expect(Number(data.costPrice)).toBeCloseTo(0.00155, 8);
    // sell × 1.2 = 0.00186
    expect(Number(data.sellPrice)).toBeCloseTo(0.00186, 8);
    expect(data.promptTokens).toBe(1000);
    expect(data.completionTokens).toBe(500);
    expect(data.totalTokens).toBe(1500);
    expect(data.status).toBe("SUCCESS");
  });

  it("token-priced channel + missing usage → cost=0, tokens=null, no throw", async () => {
    const route = makeRoute(
      { unit: "token", inputPer1M: 0.3, outputPer1M: 2.5 },
      { unit: "token", inputPer1M: 0.36, outputPer1M: 3.0 },
    );
    const response: ImageGenerationResponse = {
      created: 0,
      data: [{ url: "data:image/png;base64,xx" }],
      // usage missing — adapter not propagating (e.g. older provider path)
    };

    processImageResult({
      traceId: "trc_test_no_usage",
      userId: "u1",
      projectId: "p1",
      route,
      modelName: "google/gemini-2.5-flash-image",
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
    // calculateTokenCost(null, ...) returns 0
    expect(Number(data.costPrice)).toBe(0);
    expect(Number(data.sellPrice)).toBe(0);
    expect(data.promptTokens).toBeNull();
    expect(data.completionTokens).toBeNull();
    expect(data.totalTokens).toBeNull();
  });

  it("per-call channel (volcengine seedream) ignores upstream usage, uses calculateCallCost", async () => {
    const route = makeRoute({ unit: "call", perCall: 0.037 }, { unit: "call", perCall: 0.0444 });
    const response: ImageGenerationResponse = {
      created: 0,
      data: [{ url: "https://example.com/x.png" }],
      // usage may be missing or present — for per-call channel both ignored
    };

    processImageResult({
      traceId: "trc_test_call",
      userId: "u1",
      projectId: "p1",
      route,
      modelName: "seedream-3.0",
      promptSnapshot: [],
      requestParams: { prompt: "a dot" },
      startTime: Date.now() - 50,
      response,
      source: "api",
    });
    await flushAsync();

    const writeCall = txCreateMock.mock.calls[0] ?? callLogCreateMock.mock.calls[0];
    expect(writeCall).toBeDefined();
    const data = writeCall![0].data;
    // perCall=0.037 → costPrice=0.037
    expect(Number(data.costPrice)).toBeCloseTo(0.037, 8);
    expect(Number(data.sellPrice)).toBeCloseTo(0.0444, 8);
    // tokens NOT recorded for per-call path
    expect(data.promptTokens).toBeNull();
    expect(data.completionTokens).toBeNull();
  });

  it("token-priced channel + ERROR status → cost=0, no charge", async () => {
    const route = makeRoute(
      { unit: "token", inputPer1M: 0.3, outputPer1M: 2.5 },
      { unit: "token", inputPer1M: 0.36, outputPer1M: 3.0 },
    );

    processImageResult({
      traceId: "trc_test_err",
      userId: "u1",
      projectId: "p1",
      route,
      modelName: "google/gemini-2.5-flash-image",
      promptSnapshot: [],
      requestParams: { prompt: "x" },
      startTime: Date.now() - 50,
      error: { message: "upstream 502" },
      source: "api",
    });
    await flushAsync();

    // sellUsd=0 → tx not used, plain create
    const writeCall = callLogCreateMock.mock.calls[0];
    expect(writeCall).toBeDefined();
    const data = writeCall![0].data;
    expect(Number(data.costPrice)).toBe(0);
    expect(Number(data.sellPrice)).toBe(0);
    expect(data.status).toBe("ERROR");
  });

  // BL-RECON-FIX-PHASE2 F-RP-03: image-via-chat e2e cost passthrough
  // 用 F-RP-01 调研报告的实测 OR 响应 shape（gen-1777274549-… 真实数据）
  // 验证 processImageResult 把 usage.upstreamCostUsd 正确传到 CallLog.costPrice
  describe("F-RP-03 OR upstream cost passthrough (image-via-chat)", () => {
    it("OR gemini-2.5-flash-image with usage.cost → CallLog.costPrice ∈ [$0.030, $0.045]", async () => {
      // Real shape captured 2026-04-27 from OR direct probe (see
      // docs/audits/openrouter-image-usage-shape-2026-04-27.md)
      const route = makeRoute(
        { unit: "token", inputPer1M: 0.3, outputPer1M: 2.5 },
        { unit: "token", inputPer1M: 0.36, outputPer1M: 3.0 },
      );
      const usage: Usage = {
        prompt_tokens: 7,
        completion_tokens: 1304,
        total_tokens: 1311,
        upstreamCostUsd: 0.0387371, // 来自 raw.cost / cost_details.upstream_inference_cost
      };
      const response: ImageGenerationResponse = {
        created: 0,
        data: [{ url: "data:image/png;base64,iVBORw0KGgo" }],
        usage,
      };

      processImageResult({
        traceId: "trc_e2e_or_image",
        userId: "u1",
        projectId: "p1",
        route,
        modelName: "google/gemini-2.5-flash-image",
        promptSnapshot: [],
        requestParams: { prompt: "A simple red circle on white background" },
        startTime: Date.now() - 50,
        response,
        source: "api",
      });
      await flushAsync();

      const writeCall = txCreateMock.mock.calls[0] ?? callLogCreateMock.mock.calls[0];
      expect(writeCall).toBeDefined();
      const data = writeCall![0].data;
      // 短路命中：costPrice 直接 = upstreamCostUsd（OR 实收）
      expect(Number(data.costPrice)).toBeCloseTo(0.0387371, 8);
      // F-RP-04 acceptance 区间断言
      expect(Number(data.costPrice)).toBeGreaterThanOrEqual(0.03);
      expect(Number(data.costPrice)).toBeLessThanOrEqual(0.045);
      // sellPrice 仍走公式（产品定价不变）：7×0.36/1M + 1304×3/1M ≈ 0.003915
      expect(Number(data.sellPrice)).toBeCloseTo(
        (7 / 1_000_000) * 0.36 + (1304 / 1_000_000) * 3,
        8,
      );
      expect(data.promptTokens).toBe(7);
      expect(data.completionTokens).toBe(1304);
      expect(data.totalTokens).toBe(1311);
      expect(data.status).toBe("SUCCESS");
    });

    it("text-only chat without upstreamCostUsd → cost still uses token formula (regression)", async () => {
      // 纯文本回归：usage 不带 upstreamCostUsd → 走原 token×单价 公式
      const route = makeRoute(
        { unit: "token", inputPer1M: 0.3, outputPer1M: 2.5 },
        { unit: "token", inputPer1M: 0.36, outputPer1M: 3.0 },
      );
      const usage: Usage = {
        prompt_tokens: 1000,
        completion_tokens: 500,
        total_tokens: 1500,
        // no upstreamCostUsd — 模拟 provider 不返 cost 字段
      };
      const response: ImageGenerationResponse = {
        created: 0,
        data: [{ url: "data:image/png;base64,xx" }],
        usage,
      };

      processImageResult({
        traceId: "trc_e2e_text",
        userId: "u1",
        projectId: "p1",
        route,
        modelName: "google/gemini-2.5-flash-image",
        promptSnapshot: [],
        requestParams: { prompt: "describe blue" },
        startTime: Date.now() - 50,
        response,
        source: "api",
      });
      await flushAsync();

      const writeCall = txCreateMock.mock.calls[0] ?? callLogCreateMock.mock.calls[0];
      const data = writeCall![0].data;
      // 公式：1000×0.3/1M + 500×2.5/1M = 0.00155
      expect(Number(data.costPrice)).toBeCloseTo(0.00155, 8);
    });

    it("OR upstreamCostUsd>0 short-circuits even if token-formula would compute different value", async () => {
      // 防回归：即使 token 配置很贵导致公式 > upstreamCostUsd，仍然按 OR 实收
      const route = makeRoute(
        { unit: "token", inputPer1M: 100, outputPer1M: 200 }, // 故意配高
        { unit: "token", inputPer1M: 120, outputPer1M: 240 },
      );
      const usage: Usage = {
        prompt_tokens: 7,
        completion_tokens: 1304,
        total_tokens: 1311,
        upstreamCostUsd: 0.0387371,
      };
      const response: ImageGenerationResponse = {
        created: 0,
        data: [{ url: "x" }],
        usage,
      };

      processImageResult({
        traceId: "trc_e2e_short_circuit",
        userId: "u1",
        projectId: "p1",
        route,
        modelName: "google/gemini-2.5-flash-image",
        promptSnapshot: [],
        requestParams: { prompt: "x" },
        startTime: Date.now() - 50,
        response,
        source: "api",
      });
      await flushAsync();

      const writeCall = txCreateMock.mock.calls[0] ?? callLogCreateMock.mock.calls[0];
      const data = writeCall![0].data;
      // costPrice 用 OR 实收（即使公式会算出 0.2615 也不该用）
      expect(Number(data.costPrice)).toBeCloseTo(0.0387371, 8);
    });
  });

  it("token-priced channel + zero pricing → WARN logged, cost=0", async () => {
    const route = makeRoute(
      { unit: "token", inputPer1M: 0, outputPer1M: 0 },
      { unit: "token", inputPer1M: 0, outputPer1M: 0 },
    );
    const usage: Usage = {
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
    };
    const response: ImageGenerationResponse = {
      created: 0,
      data: [{ url: "x" }],
      usage,
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    processImageResult({
      traceId: "trc_test_zero_token",
      userId: "u1",
      projectId: "p1",
      route,
      modelName: "google/gemini-2.5-flash-image",
      promptSnapshot: [],
      requestParams: { prompt: "x" },
      startTime: Date.now() - 50,
      response,
      source: "api",
    });
    await flushAsync();

    const writeCall = callLogCreateMock.mock.calls[0];
    expect(writeCall).toBeDefined();
    const data = writeCall![0].data;
    expect(Number(data.costPrice)).toBe(0);
    expect(Number(data.sellPrice)).toBe(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
