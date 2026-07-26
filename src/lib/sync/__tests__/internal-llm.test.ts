/**
 * BL-BILLING-AUDIT-EXT-P1 F-BAX-03 — callSyncLLM fallback chain & call_log.
 *
 * Category D 盲区修复：alias-classifier / doc-enricher 改走 engine 层后：
 *   1) 正常：deepseek-v4-flash 成功 → 写 call_log source='sync'
 *   2) Fallback：deepseek-v4-flash MODEL_NOT_FOUND → glm-5 成功 → 写 call_log
 *   3) 全部挂：3 个 alias 都抛错 → callSyncLLM 抛 "All sync LLM fallbacks exhausted"
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EngineError, ErrorCodes } from "../../engine/types";
import type { RouteResult, ChatCompletionResponse } from "../../engine/types";

const resolveEngineMock = vi.fn();
const writeSyncCallLogMock = vi.fn();

vi.mock("@/lib/engine/router", () => ({
  resolveEngine: (aliasName: string) => resolveEngineMock(aliasName),
  getAdapterForRoute: () => ({}),
}));

// withFailover 走真实实现，但 getAdapterForRoute 在 candidates 已经打好 mock
// adapter 时让它直接返回 route 上挂的 adapter。这里走简化路径——我们在
// resolveEngine mock 里同时返回 `{ candidates }` 且 candidates 上挂 adapter。
vi.mock("@/lib/engine/failover", () => ({
  withFailover: async (
    candidates: Array<
      RouteResult & { __adapter: { chatCompletions: () => Promise<ChatCompletionResponse> } }
    >,
    fn: (
      r: RouteResult,
      a: { chatCompletions: () => Promise<ChatCompletionResponse> },
    ) => Promise<ChatCompletionResponse>,
  ) => {
    let lastErr: unknown;
    for (const c of candidates) {
      try {
        const result = await fn(c, c.__adapter);
        return { result, route: c, attempts: 1 };
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  },
}));

vi.mock("@/lib/api/post-process", () => ({
  writeSyncCallLog: (params: unknown) => writeSyncCallLogMock(params),
}));

import { callSyncLLM, SYNC_MODEL_FALLBACK_CHAIN } from "../internal-llm";

function makeRouteWithAdapter(
  aliasName: string,
  chatResult: ChatCompletionResponse | (() => never),
): RouteResult & { __adapter: { chatCompletions: () => Promise<ChatCompletionResponse> } } {
  return {
    channel: { id: `ch-${aliasName}` },
    provider: { name: "p" },
    config: { currency: "USD" },
    model: { id: `m-${aliasName}`, name: aliasName, modality: "TEXT" },
    alias: { alias: aliasName },
    __adapter: {
      chatCompletions:
        typeof chatResult === "function"
          ? async () => {
              (chatResult as () => never)();
            }
          : async () => chatResult,
    },
  } as unknown as RouteResult & {
    __adapter: { chatCompletions: () => Promise<ChatCompletionResponse> };
  };
}

function okResponse(content: string): ChatCompletionResponse {
  return {
    id: "r1",
    object: "chat.completion",
    created: 0,
    model: "test",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };
}

beforeEach(() => {
  resolveEngineMock.mockReset();
  writeSyncCallLogMock.mockReset();
});

describe("F-BAX-03 callSyncLLM", () => {
  it("SYNC_MODEL_FALLBACK_CHAIN is the documented 3-alias chain", () => {
    expect(SYNC_MODEL_FALLBACK_CHAIN).toEqual(["deepseek-v4-flash", "glm-5", "doubao-pro"]);
  });

  it("normal path — first alias succeeds, writes call_log source='sync'", async () => {
    const route = makeRouteWithAdapter("deepseek-v4-flash", okResponse('{"ok":true}'));
    resolveEngineMock.mockResolvedValueOnce({ candidates: [route] });

    const content = await callSyncLLM("test prompt", { taskName: "unit_test" });

    expect(content).toBe('{"ok":true}');
    expect(resolveEngineMock).toHaveBeenCalledTimes(1);
    expect(resolveEngineMock).toHaveBeenCalledWith("deepseek-v4-flash");
    expect(writeSyncCallLogMock).toHaveBeenCalledTimes(1);
    const logParams = writeSyncCallLogMock.mock.calls[0][0];
    expect(logParams.taskName).toBe("unit_test");
    expect(logParams.traceId).toMatch(/^sync_unit_test_/);
    expect(logParams.route.channel.id).toBe("ch-deepseek-v4-flash");
  });

  it("fallback — first alias MODEL_NOT_FOUND, second alias succeeds", async () => {
    resolveEngineMock.mockImplementationOnce(async () => {
      throw new EngineError("deepseek-v4-flash not found", ErrorCodes.MODEL_NOT_FOUND, 404);
    });
    const route = makeRouteWithAdapter("glm-5", okResponse('{"fallback":true}'));
    resolveEngineMock.mockResolvedValueOnce({ candidates: [route] });

    const content = await callSyncLLM("p", { taskName: "fallback_test" });

    expect(content).toBe('{"fallback":true}');
    expect(resolveEngineMock).toHaveBeenCalledTimes(2);
    expect(resolveEngineMock.mock.calls[0][0]).toBe("deepseek-v4-flash");
    expect(resolveEngineMock.mock.calls[1][0]).toBe("glm-5");
    expect(writeSyncCallLogMock).toHaveBeenCalledTimes(1);
    expect(writeSyncCallLogMock.mock.calls[0][0].route.channel.id).toBe("ch-glm-5");
  });

  it("all fallbacks exhausted — throws descriptive error", async () => {
    resolveEngineMock.mockRejectedValue(
      new EngineError("not available", ErrorCodes.MODEL_NOT_FOUND, 404),
    );

    await expect(callSyncLLM("p", { taskName: "exhaust" })).rejects.toThrow(
      /All sync LLM fallbacks exhausted/i,
    );

    expect(resolveEngineMock).toHaveBeenCalledTimes(3);
    expect(writeSyncCallLogMock).not.toHaveBeenCalled();
  });

  it("CONTENT_FILTERED propagates immediately (no fallback)", async () => {
    const route = makeRouteWithAdapter("deepseek-v4-flash", () => {
      throw new EngineError("filtered", ErrorCodes.CONTENT_FILTERED, 400);
    });
    resolveEngineMock.mockResolvedValueOnce({ candidates: [route] });

    await expect(callSyncLLM("p", { taskName: "filter" })).rejects.toThrow(/filtered/i);
    // Only the first alias is attempted — filter errors don't warrant fallback
    expect(resolveEngineMock).toHaveBeenCalledTimes(1);
  });
});

/**
 * BL-DEEPSEEK-V4-HOTFIX F-DSV4-04 — 链腐坏可见性。
 *
 * 旧链首 `deepseek-chat` 和次位 `glm-4.7` 在生产双双 enabled=false，每次调用
 * 都空转两跳才落到 doubao-pro，而这两跳的失败混在通用 warn 里没人看见。
 * MODEL_NOT_FOUND 说明的是"配置腐坏"而非"运行时故障"，必须能一眼认出来。
 */
describe("F-DSV4-04 链腐坏告警", () => {
  it("MODEL_NOT_FOUND 打出 chain rot 专用警告并带上别名", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    resolveEngineMock.mockImplementationOnce(async () => {
      throw new EngineError("gone", ErrorCodes.MODEL_NOT_FOUND, 404);
    });
    const route = makeRouteWithAdapter("glm-5", okResponse('{"ok":true}'));
    resolveEngineMock.mockResolvedValueOnce({ candidates: [route] });

    await callSyncLLM("p", { taskName: "rot" });

    const rotLines = warn.mock.calls.map(String).filter((l) => l.includes("chain rot"));
    expect(rotLines).toHaveLength(1);
    expect(rotLines[0]).toContain("deepseek-v4-flash");
    warn.mockRestore();
  });

  it("非 MODEL_NOT_FOUND 的失败不误报为链腐坏", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    resolveEngineMock.mockImplementationOnce(async () => {
      throw new EngineError("upstream 500", ErrorCodes.PROVIDER_ERROR, 502);
    });
    const route = makeRouteWithAdapter("glm-5", okResponse('{"ok":true}'));
    resolveEngineMock.mockResolvedValueOnce({ candidates: [route] });

    await callSyncLLM("p", { taskName: "not_rot" });

    expect(warn.mock.calls.map(String).filter((l) => l.includes("chain rot"))).toHaveLength(0);
    warn.mockRestore();
  });
});
