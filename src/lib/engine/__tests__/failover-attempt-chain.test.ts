/**
 * BL-BILLING-AUDIT-EXT-P1 F-BAX-04 — withFailover attemptChain 返回值。
 *
 * 消除 "call_logs.channelId 与 errorMessage 错位" 类问题（KOLMatrix
 * trc_cvu84f / trc_kju9fxz5 现象）：旧逻辑 channelId = 最终成功/最后失败
 * channel，errorMessage 来自 catch 块（可能保留了其他 channel 的消息）。
 *
 * 断言：
 *   1) 两次失败一次成功 → attemptChain 3 条：失败两条含 errorCode/errorMessage，
 *      最终那条仅 channelId；route.channel.id 等于成功那个
 *   2) 全部失败 → 抛出 Error 上挂 attemptChain（getAttemptChainFromError 可读）
 *   3) 单个 candidate 成功 → attemptChain 1 条（仅 channelId）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RouteResult } from "../types";
import { EngineError, ErrorCodes } from "../types";
import { withFailover, getAttemptChainFromError } from "../failover";

vi.mock("../cooldown", () => ({
  markChannelCooldown: vi.fn().mockResolvedValue(undefined),
}));

// Each route carries its own adapter stub via __adapter so the shared
// getAdapterForRoute mock below can dispatch per-route behaviour.
vi.mock("../router", () => ({
  getAdapterForRoute: (route: RouteResult & { __adapter?: unknown }) =>
    (route as unknown as { __adapter: unknown }).__adapter,
}));

interface MockAdapter {
  chatCompletions: () => Promise<{ ok: true; channelId: string }>;
}

function makeRoute(id: string, providerId: string, behavior: "success" | Error): RouteResult {
  const adapter: MockAdapter = {
    chatCompletions:
      behavior === "success"
        ? async () => ({ ok: true as const, channelId: id })
        : async () => {
            throw behavior;
          },
  };
  return {
    channel: { id, priority: 0, status: "ACTIVE" },
    provider: { id: providerId, name: providerId, adapterType: "openai-compat", config: {} },
    config: { id: `cfg-${providerId}`, currency: "USD" },
    model: { id: "m-1", name: "test", modality: "TEXT" },
    alias: { modality: "TEXT" },
    __adapter: adapter,
  } as unknown as RouteResult;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("F-BAX-04 withFailover attemptChain", () => {
  it("two failures + one success → 3 records, route is the successful one", async () => {
    // Different providers so CROSS_PROVIDER_ONLY codes (if used) retry; here
    // we use provider_error which is retryable regardless.
    const candidates = [
      makeRoute("ch-A", "prov-1", new EngineError("503", ErrorCodes.PROVIDER_ERROR, 503)),
      makeRoute("ch-B", "prov-2", new EngineError("timeout", ErrorCodes.TIMEOUT, 504)),
      makeRoute("ch-C", "prov-3", "success"),
    ];

    const out = await withFailover(candidates, (r, a) => {
      const adapter = a as unknown as MockAdapter;
      return adapter.chatCompletions();
    });

    expect(out.route.channel.id).toBe("ch-C");
    expect(out.attempts).toBe(3);
    expect(out.attemptChain).toHaveLength(3);
    expect(out.attemptChain[0]).toMatchObject({
      channelId: "ch-A",
      errorCode: ErrorCodes.PROVIDER_ERROR,
    });
    expect(out.attemptChain[1]).toMatchObject({
      channelId: "ch-B",
      errorCode: ErrorCodes.TIMEOUT,
    });
    // Successful attempt has no error fields
    expect(out.attemptChain[2].channelId).toBe("ch-C");
    expect(out.attemptChain[2].errorCode).toBeUndefined();
  });

  it("all failures → error annotated with attemptChain", async () => {
    const candidates = [
      makeRoute("ch-A", "prov-1", new EngineError("503", ErrorCodes.PROVIDER_ERROR, 503)),
      makeRoute("ch-B", "prov-2", new EngineError("504", ErrorCodes.TIMEOUT, 504)),
    ];

    await expect(
      withFailover(candidates, (r, a) => {
        const adapter = a as unknown as MockAdapter;
        return adapter.chatCompletions();
      }),
    ).rejects.toThrow();

    // Re-run to catch the error and inspect attachment.
    let caught: unknown;
    try {
      await withFailover(candidates, (r, a) => {
        const adapter = a as unknown as MockAdapter;
        return adapter.chatCompletions();
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    const chain = getAttemptChainFromError(caught);
    expect(chain).not.toBeNull();
    expect(chain).toHaveLength(2);
    expect(chain?.[0].channelId).toBe("ch-A");
    expect(chain?.[1].channelId).toBe("ch-B");
    expect(chain?.[1].errorCode).toBe(ErrorCodes.TIMEOUT);
  });

  it("single candidate success → attemptChain has 1 record", async () => {
    const candidates = [makeRoute("ch-solo", "prov-1", "success")];

    const out = await withFailover(candidates, (r, a) => {
      const adapter = a as unknown as MockAdapter;
      return adapter.chatCompletions();
    });

    expect(out.attemptChain).toHaveLength(1);
    expect(out.attemptChain[0]).toEqual({ channelId: "ch-solo" });
  });

  it("getAttemptChainFromError returns null for unrelated errors", () => {
    expect(getAttemptChainFromError(new Error("oops"))).toBeNull();
    expect(getAttemptChainFromError("string")).toBeNull();
    expect(getAttemptChainFromError(null)).toBeNull();
  });
});
