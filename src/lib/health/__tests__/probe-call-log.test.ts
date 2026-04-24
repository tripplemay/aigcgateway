/**
 * BL-BILLING-AUDIT-EXT-P1 F-BAX-02 — probe / admin_health 写 call_log。
 *
 * 修复 Category B/C 盲区：health probe（scheduler runTextCheck/runCallProbe
 * 以及 admin 手动触发）产生的上游 chat/image 调用原本只写 health_checks，
 * 不写 call_logs。修复后 probe 路径把 source='probe'，admin 手动路径
 * source='admin_health'，projectId=null 透传进 call_logs。
 *
 * 本测试用例（5 条）：
 *   1) runTextCheck success → 写出 1 条 call_log source='probe'，projectId=null
 *   2) runTextCheck engine error → 写出 1 条 call_log status='ERROR'
 *   3) runCallProbe IMAGE success → 写出 1 条 call_log，isImage=true 路径
 *   4) runHealthCheck 显式 source='admin_health' → 写出 source='admin_health'
 *   5) writeProbeCallLog 直接调用（projectId=null + source='probe' 成功入库）—
 *      覆盖 F-BAX-01 acceptance item 6（schema 接受 probe + null projectId）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EngineError, ErrorCodes } from "../../engine/types";
import type { RouteResult } from "../../engine/types";

const chatCompletionsMock = vi.fn();
const imageGenerationsMock = vi.fn();
const callLogCreateMock = vi.fn();

vi.mock("../../engine/router", () => ({
  getAdapterForRoute: () => ({
    chatCompletions: chatCompletionsMock,
    imageGenerations: imageGenerationsMock,
    chatCompletionsStream: vi.fn(),
  }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    callLog: {
      create: (args: unknown) => callLogCreateMock(args),
    },
  },
}));

vi.mock("@/lib/notifications/triggers", () => ({
  checkAndSendBalanceLowAlert: vi.fn(),
}));

vi.mock("../../api/rate-limit", () => ({
  recordTokenUsage: vi.fn(),
  recordSpending: vi.fn(),
}));

import { runHealthCheck, runCallProbe } from "../checker";
import { writeProbeCallLog } from "@/lib/api/post-process";

const textRoute: RouteResult = {
  channel: {
    id: "ch-text-1",
    costPrice: { inputPer1M: 0.1, outputPer1M: 0.2 },
    sellPrice: { inputPer1M: 1, outputPer1M: 2 },
  },
  provider: { name: "deepseek" },
  config: { currency: "USD" },
  model: {
    id: "m-text-1",
    name: "deepseek-chat",
    modality: "TEXT",
    supportedSizes: null,
    capabilities: {},
  },
  alias: { modality: "TEXT" },
} as unknown as RouteResult;

const imageRoute: RouteResult = {
  channel: {
    id: "ch-img-1",
    costPrice: { perCall: 0.01 },
    sellPrice: { perCall: 0.02 },
  },
  provider: { name: "volcengine" },
  config: { currency: "USD" },
  model: {
    id: "m-img-1",
    name: "seedream-3",
    modality: "IMAGE",
    supportedSizes: ["1024x1024"],
    capabilities: {},
  },
  alias: { modality: "IMAGE" },
} as unknown as RouteResult;

beforeEach(() => {
  chatCompletionsMock.mockReset();
  imageGenerationsMock.mockReset();
  callLogCreateMock.mockReset();
  callLogCreateMock.mockResolvedValue({ id: "cl_mock" });
});

async function flushMicrotasks(): Promise<void> {
  // writeProbeCallLog is fire-and-forget — await two ticks so the inner
  // promise chain (prisma.callLog.create) resolves before assertions.
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("F-BAX-02 probe → call_log", () => {
  it("runHealthCheck success writes call_log with source='probe', projectId=null", async () => {
    chatCompletionsMock.mockResolvedValueOnce({
      choices: [{ message: { role: "assistant", content: "." }, finish_reason: "stop" }],
      usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
    });

    const results = await runHealthCheck(textRoute);
    await flushMicrotasks();

    expect(results[0].result).toBe("PASS");
    expect(callLogCreateMock).toHaveBeenCalledTimes(1);
    const row = callLogCreateMock.mock.calls[0][0].data;
    expect(row.source).toBe("probe");
    expect(row.projectId).toBeNull();
    expect(row.channelId).toBe("ch-text-1");
    expect(row.status).toBe("SUCCESS");
    expect(row.traceId).toMatch(/^probe_ch-text-1_/);
    expect(row.promptTokens).toBe(5);
    expect(row.completionTokens).toBe(1);
  });

  it("runHealthCheck EngineError writes call_log with status='ERROR'", async () => {
    chatCompletionsMock.mockRejectedValueOnce(
      new EngineError("429 Too Many Requests", ErrorCodes.RATE_LIMITED, 429),
    );

    await runHealthCheck(textRoute);
    await flushMicrotasks();

    expect(callLogCreateMock).toHaveBeenCalledTimes(1);
    const row = callLogCreateMock.mock.calls[0][0].data;
    expect(row.source).toBe("probe");
    expect(row.projectId).toBeNull();
    expect(row.status).toBe("ERROR");
    expect(row.errorCode).toBe(ErrorCodes.RATE_LIMITED);
    // Sanitized but should still contain "429" substring
    expect(row.errorMessage).toMatch(/429/);
  });

  it("runCallProbe IMAGE success writes call_log (per-call cost)", async () => {
    imageGenerationsMock.mockResolvedValueOnce({
      created: 0,
      data: [{ url: "https://example.com/a.png" }],
    });

    const res = await runCallProbe(imageRoute);
    await flushMicrotasks();

    expect(res.result).toBe("PASS");
    expect(callLogCreateMock).toHaveBeenCalledTimes(1);
    const row = callLogCreateMock.mock.calls[0][0].data;
    expect(row.source).toBe("probe");
    expect(row.projectId).toBeNull();
    expect(row.channelId).toBe("ch-img-1");
    expect(row.status).toBe("SUCCESS");
    expect(row.responseSummary).toEqual({ images_count: 1 });
    // perCall cost should be non-zero for success with channel.costPrice.perCall configured
    expect(Number(row.costPrice)).toBeGreaterThan(0);
  });

  it("runHealthCheck with source='admin_health' writes call_log.source='admin_health'", async () => {
    chatCompletionsMock.mockResolvedValueOnce({
      choices: [{ message: { content: "." }, finish_reason: "stop" }],
      usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
    });

    await runHealthCheck(textRoute, "admin_health");
    await flushMicrotasks();

    expect(callLogCreateMock).toHaveBeenCalledTimes(1);
    const row = callLogCreateMock.mock.calls[0][0].data;
    expect(row.source).toBe("admin_health");
    expect(row.projectId).toBeNull();
    expect(row.traceId).toMatch(/^admin_health_ch-text-1_/);
  });

  it("writeProbeCallLog direct call with projectId=null + source='probe' hits prisma.create", async () => {
    writeProbeCallLog({
      traceId: "probe_direct_1",
      route: textRoute,
      source: "probe",
      startTime: Date.now() - 42,
      response: {
        id: "r1",
        object: "chat.completion",
        created: 0,
        model: "deepseek-chat",
        choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
      },
      isImage: false,
    });
    await flushMicrotasks();

    expect(callLogCreateMock).toHaveBeenCalledTimes(1);
    const row = callLogCreateMock.mock.calls[0][0].data;
    expect(row.source).toBe("probe");
    expect(row.projectId).toBeNull();
    expect(row.status).toBe("SUCCESS");
    expect(row.totalTokens).toBe(3);
  });
});
