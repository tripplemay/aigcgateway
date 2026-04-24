/**
 * BL-BILLING-AUDIT-EXT-P1 F-BAX-03 — callSyncLLM fallback chain & call_log.
 *
 * Category D 盲区修复：alias-classifier / doc-enricher 改走 engine 层后：
 *   1) 正常：deepseek-chat 成功 → 写 call_log source='sync'
 *   2) Fallback：deepseek-chat MODEL_NOT_FOUND → glm-4.7 成功 → 写 call_log
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
    candidates: Array<RouteResult & { __adapter: { chatCompletions: () => Promise<ChatCompletionResponse> } }>,
    fn: (r: RouteResult, a: { chatCompletions: () => Promise<ChatCompletionResponse> }) => Promise<ChatCompletionResponse>,
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
    expect(SYNC_MODEL_FALLBACK_CHAIN).toEqual(["deepseek-chat", "glm-4.7", "doubao-pro"]);
  });

  it("normal path — first alias succeeds, writes call_log source='sync'", async () => {
    const route = makeRouteWithAdapter("deepseek-chat", okResponse("{\"ok\":true}"));
    resolveEngineMock.mockResolvedValueOnce({ candidates: [route] });

    const content = await callSyncLLM("test prompt", { taskName: "unit_test" });

    expect(content).toBe("{\"ok\":true}");
    expect(resolveEngineMock).toHaveBeenCalledTimes(1);
    expect(resolveEngineMock).toHaveBeenCalledWith("deepseek-chat");
    expect(writeSyncCallLogMock).toHaveBeenCalledTimes(1);
    const logParams = writeSyncCallLogMock.mock.calls[0][0];
    expect(logParams.taskName).toBe("unit_test");
    expect(logParams.traceId).toMatch(/^sync_unit_test_/);
    expect(logParams.route.channel.id).toBe("ch-deepseek-chat");
  });

  it("fallback — first alias MODEL_NOT_FOUND, second alias succeeds", async () => {
    resolveEngineMock.mockImplementationOnce(async () => {
      throw new EngineError("deepseek-chat not found", ErrorCodes.MODEL_NOT_FOUND, 404);
    });
    const route = makeRouteWithAdapter("glm-4.7", okResponse("{\"fallback\":true}"));
    resolveEngineMock.mockResolvedValueOnce({ candidates: [route] });

    const content = await callSyncLLM("p", { taskName: "fallback_test" });

    expect(content).toBe("{\"fallback\":true}");
    expect(resolveEngineMock).toHaveBeenCalledTimes(2);
    expect(resolveEngineMock.mock.calls[0][0]).toBe("deepseek-chat");
    expect(resolveEngineMock.mock.calls[1][0]).toBe("glm-4.7");
    expect(writeSyncCallLogMock).toHaveBeenCalledTimes(1);
    expect(writeSyncCallLogMock.mock.calls[0][0].route.channel.id).toBe("ch-glm-4.7");
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
    const route = makeRouteWithAdapter("deepseek-chat", () => {
      throw new EngineError("filtered", ErrorCodes.CONTENT_FILTERED, 400);
    });
    resolveEngineMock.mockResolvedValueOnce({ candidates: [route] });

    await expect(callSyncLLM("p", { taskName: "filter" })).rejects.toThrow(/filtered/i);
    // Only the first alias is attempted — filter errors don't warrant fallback
    expect(resolveEngineMock).toHaveBeenCalledTimes(1);
  });
});
