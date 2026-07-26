/**
 * BL-DEEPSEEK-V4-HOTFIX F-DSV4-05 — 「模型名不受支持」的 400 必须可跨通道 failover。
 *
 * 事故：DeepSeek 直连下线 `deepseek-chat` 后，占着 `deepseek-v3` 别名 priority=1
 * 的通道每次都被上游回 400。该 400 被无条件映射成 INVALID_REQUEST，而它在
 * `failover.NEVER_RETRY` 里 → 同别名下另外 7 条健康通道**一条都没被尝试**，
 * 用户直接吃到硬失败。
 *
 * 发往上游的模型名是 `channel.realModelId`，完全由网关决定（用户传的是别名），
 * 所以这类 400 的责任方是网关配置而非调用方 —— 应该降级重试，不该终局失败。
 *
 * 反向同样重要：参数非法 / 内容违规的 400 必须保持不可 failover，否则确定性
 * 失败会变成 N 次无效重试 + N 倍延迟。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RouteResult } from "../types";
import { EngineError, ErrorCodes } from "../types";
import { withFailover } from "../failover";
import { isUnsupportedModelError, mapBodyError, OpenAICompatEngine } from "../openai-compat";

/** mapProviderError 是 protected —— 子类暴露出来测真实的 HTTP 4xx 分支 */
class ProbeEngine extends OpenAICompatEngine {
  public map(status: number, body: string): EngineError {
    return this.mapProviderError(status, body);
  }
}

vi.mock("../cooldown", () => ({
  markChannelCooldown: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../router", () => ({
  getAdapterForRoute: (route: RouteResult & { __adapter?: unknown }) =>
    (route as unknown as { __adapter: unknown }).__adapter,
}));

function makeRoute(id: string, providerId: string, behavior: "success" | Error): RouteResult {
  return {
    channel: { id, priority: 0, status: "ACTIVE" },
    provider: { id: providerId, name: providerId, adapterType: "openai-compat", config: {} },
    config: { id: `cfg-${providerId}`, currency: "USD" },
    model: { id: "m-1", name: "test", modality: "TEXT" },
    alias: { modality: "TEXT" },
    __adapter: {
      chatCompletions:
        behavior === "success"
          ? async () => ({ ok: true as const, channelId: id })
          : async () => {
              throw behavior;
            },
    },
  } as unknown as RouteResult;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// 2026-07-25 逐家真实探测采集，不是构造的样本
const REAL_UPSTREAM_TEXTS: Array<[string, string]> = [
  [
    "deepseek",
    "The supported API model names are deepseek-v4-pro or deepseek-v4-flash, but you passed deepseek-chat.",
  ],
  ["siliconflow", "Model does not exist. Please check it carefully."],
  ["zhipu", "模型不存在，请检查模型代码。"],
  ["minimax", "invalid params, unknown model 'definitely-not-a-real-model-xyz' (2013)"],
  ["openrouter", "definitely-not-a-real-model-xyz is not a valid model ID"],
];

describe("isUnsupportedModelError — 正向（真实上游文案）", () => {
  it.each(REAL_UPSTREAM_TEXTS)("识别 %s 的模型名错误", (_provider, text) => {
    expect(isUnsupportedModelError(text)).toBe(true);
  });

  it("识别 OpenAI 系的 model_not_found 错误码", () => {
    expect(isUnsupportedModelError("something opaque", "model_not_found")).toBe(true);
  });
});

describe("isUnsupportedModelError — 反向（不得放宽）", () => {
  const NOT_MODEL_ERRORS = [
    "Invalid value for 'temperature': must be <= 2",
    "messages: at least one message is required",
    "Your request was rejected as a result of our safety system.",
    "max_tokens is too large for this context window",
    "Invalid API key provided",
    "You exceeded your current quota",
    "This request requires more credits, or fewer max_tokens.",
  ];

  it.each(NOT_MODEL_ERRORS)("不误判：%s", (text) => {
    expect(isUnsupportedModelError(text)).toBe(false);
  });
});

describe("mapBodyError — 模型名错误优先于 invalid_request", () => {
  it("MiniMax 信封同时带 bad_request_error 和 unknown model → MODEL_NOT_FOUND", () => {
    // 这条顺序如果写反，MiniMax 会先命中 invalid_request 分支而不可 failover
    const err = mapBodyError({
      type: "error",
      error: {
        type: "bad_request_error",
        message: "invalid params, unknown model 'x' (2013)",
        http_code: "400",
      },
    });
    expect(err?.code).toBe(ErrorCodes.MODEL_NOT_FOUND);
  });

  it("纯参数类 bad request 仍是 INVALID_REQUEST", () => {
    const err = mapBodyError({
      error: { type: "bad_request_error", message: "invalid params: temperature out of range" },
    });
    expect(err?.code).toBe(ErrorCodes.INVALID_REQUEST);
  });

  it("鉴权失败不被模型名分支抢走", () => {
    const err = mapBodyError({ error: { message: "Invalid API key provided", code: "401" } });
    expect(err?.code).toBe(ErrorCodes.AUTH_FAILED);
  });
});

describe("mapProviderError — 真实 HTTP 4xx 响应体", () => {
  const engine = new ProbeEngine();

  it("DeepSeek 400 原样响应体 → MODEL_NOT_FOUND，且保留上游原文", () => {
    const err = engine.map(
      400,
      JSON.stringify({
        error: {
          message:
            "The supported API model names are deepseek-v4-pro or deepseek-v4-flash, but you passed deepseek-chat.",
          type: "invalid_request_error",
          param: null,
          code: "invalid_request_error",
        },
      }),
    );
    expect(err.code).toBe(ErrorCodes.MODEL_NOT_FOUND);
    expect(err.message).toContain("deepseek-v4-pro or deepseek-v4-flash");
  });

  it("SiliconFlow 的平铺 {code,message} 信封：原文不再丢失，且判为 MODEL_NOT_FOUND", () => {
    // 原实现只读 parsed.error.message，这个信封没有 error 键 → 消息退化成
    // "Provider returned 400"，既看不懂也匹配不上
    const err = engine.map(
      400,
      JSON.stringify({ code: 20012, message: "Model does not exist. Please check it carefully." }),
    );
    expect(err.code).toBe(ErrorCodes.MODEL_NOT_FOUND);
    expect(err.message).toContain("Model does not exist");
  });

  it("Zhipu 中文文案 400 → MODEL_NOT_FOUND", () => {
    const err = engine.map(
      400,
      JSON.stringify({ error: { code: "1211", message: "模型不存在，请检查模型代码。" } }),
    );
    expect(err.code).toBe(ErrorCodes.MODEL_NOT_FOUND);
  });

  it("OpenRouter 400 → MODEL_NOT_FOUND", () => {
    const err = engine.map(
      400,
      JSON.stringify({ error: { message: "foo-model is not a valid model ID", code: 400 } }),
    );
    expect(err.code).toBe(ErrorCodes.MODEL_NOT_FOUND);
  });

  it("参数类 400 仍是 INVALID_REQUEST（不得放宽）", () => {
    const err = engine.map(
      400,
      JSON.stringify({
        error: {
          message: "Invalid value for 'temperature': must be <= 2",
          type: "invalid_request_error",
        },
      }),
    );
    expect(err.code).toBe(ErrorCodes.INVALID_REQUEST);
  });

  it("401 / 429 分支不受影响", () => {
    expect(engine.map(401, JSON.stringify({ error: { message: "bad key" } })).code).toBe(
      ErrorCodes.AUTH_FAILED,
    );
    expect(engine.map(429, JSON.stringify({ error: { message: "slow down" } })).code).toBe(
      ErrorCodes.RATE_LIMITED,
    );
  });
});

describe("failover 行为：这才是事故的实际修复点", () => {
  it("MODEL_NOT_FOUND → 降级到下一条通道并成功（旧行为：整个别名硬失败）", async () => {
    const stale = makeRoute(
      "ch-deepseek-direct",
      "deepseek",
      new EngineError(
        "The supported API model names are deepseek-v4-pro or deepseek-v4-flash, but you passed deepseek-chat.",
        ErrorCodes.MODEL_NOT_FOUND,
        400,
      ),
    );
    const healthy = makeRoute("ch-volcengine", "volcengine", "success");

    const { route } = await withFailover([stale, healthy], (r, adapter) =>
      (adapter as unknown as { chatCompletions: () => Promise<unknown> }).chatCompletions(),
    );

    expect(route.channel.id).toBe("ch-volcengine");
  });

  it("INVALID_REQUEST 仍然终局失败，不浪费重试", async () => {
    const bad = makeRoute(
      "ch-a",
      "provider-a",
      new EngineError("Invalid value for 'temperature'", ErrorCodes.INVALID_REQUEST, 400),
    );
    const healthy = makeRoute("ch-b", "provider-b", "success");
    const secondChannelCalls = vi.fn();
    (healthy as unknown as { __adapter: { chatCompletions: () => Promise<unknown> } }).__adapter = {
      chatCompletions: async () => {
        secondChannelCalls();
        return { ok: true };
      },
    };

    await expect(
      withFailover([bad, healthy], (r, adapter) =>
        (adapter as unknown as { chatCompletions: () => Promise<unknown> }).chatCompletions(),
      ),
    ).rejects.toThrow(/temperature/i);
    expect(secondChannelCalls).not.toHaveBeenCalled();
  });

  it("全部通道都是陈旧 realModelId → 仍抛错，且保留上游原文可定位", async () => {
    const msg =
      "The supported API model names are deepseek-v4-pro or deepseek-v4-flash, but you passed deepseek-chat.";
    const a = makeRoute("ch-a", "p-a", new EngineError(msg, ErrorCodes.MODEL_NOT_FOUND, 400));
    const b = makeRoute("ch-b", "p-b", new EngineError(msg, ErrorCodes.MODEL_NOT_FOUND, 400));

    await expect(
      withFailover([a, b], (r, adapter) =>
        (adapter as unknown as { chatCompletions: () => Promise<unknown> }).chatCompletions(),
      ),
    ).rejects.toThrow(/deepseek-v4-pro or deepseek-v4-flash/);
  });
});
