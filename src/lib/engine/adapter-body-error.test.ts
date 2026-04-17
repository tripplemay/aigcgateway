/**
 * F-RR2-03 — tests for HTTP 200 + body.error mapping in the three adapters.
 *
 * Structure:
 *   1. Unit tests for mapBodyError — the pure semantic matcher.
 *   2. Integration tests per adapter — subclass to bypass the
 *      proxy/fetch layer, return a fake HTTP 200 JSON body containing
 *      `{error:{...}}`, and assert an EngineError with the expected
 *      code reaches the caller instead of silently normalising.
 */

import { describe, it, expect } from "vitest";
import { mapBodyError, OpenAICompatEngine } from "./openai-compat";
import { VolcengineAdapter } from "./adapters/volcengine";
import { SiliconFlowAdapter } from "./adapters/siliconflow";
import { EngineError, ErrorCodes, type RouteResult } from "./types";

// ---------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------

const fakeRoute: RouteResult = {
  channel: {
    id: "ch_test",
    realModelId: "test-model",
    priority: 1,
    providerId: "prov_test",
  } as unknown as RouteResult["channel"],
  provider: {
    id: "prov_test",
    name: "test-provider",
    baseUrl: "https://example.test",
    proxyUrl: null,
    adapterType: "openai-compat",
    authConfig: { apiKey: "sk-test" },
  } as unknown as RouteResult["provider"],
  config: {
    chatEndpoint: "/chat/completions",
    imageEndpoint: "/images/generations",
    quirks: null,
  } as unknown as RouteResult["config"],
  model: {
    id: "m_test",
    name: "test-model",
    enabled: true,
  } as unknown as RouteResult["model"],
};

function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Test harness: swap out fetchWithProxy to return a pre-baked 200 body.
 * This keeps the throwIfBodyError code path under test without needing
 * a network mock.
 */
class FakeOpenAI extends OpenAICompatEngine {
  constructor(private readonly body: unknown) {
    super();
  }
  protected override async fetchWithProxy(): Promise<Response> {
    return okResponse(this.body);
  }
}
class FakeVolcengine extends VolcengineAdapter {
  constructor(private readonly body: unknown) {
    super();
  }
  protected override async fetchWithProxy(): Promise<Response> {
    return okResponse(this.body);
  }
}
class FakeSiliconFlow extends SiliconFlowAdapter {
  constructor(private readonly body: unknown) {
    super();
  }
  protected override async fetchWithProxy(): Promise<Response> {
    return okResponse(this.body);
  }
}

// ---------------------------------------------------------------
// 1. Pure semantic matcher
// ---------------------------------------------------------------

describe("mapBodyError (F-RR2-03)", () => {
  it("returns null when body has no error field", () => {
    expect(mapBodyError({ choices: [] })).toBeNull();
    expect(mapBodyError({})).toBeNull();
  });

  it("maps rate-limit hints to RATE_LIMITED", () => {
    const err = mapBodyError({
      error: { message: "您的账户已达到速率限制", code: "rate_limit_exceeded" },
    });
    expect(err).toBeInstanceOf(EngineError);
    expect(err?.code).toBe(ErrorCodes.RATE_LIMITED);
    expect(err?.statusCode).toBe(429);
  });

  it("maps auth hints to AUTH_FAILED", () => {
    const err = mapBodyError({
      error: { message: "Invalid API key provided", code: "invalid_api_key" },
    });
    expect(err?.code).toBe(ErrorCodes.AUTH_FAILED);
    expect(err?.statusCode).toBe(401);
  });

  it("maps balance/credit hints to INSUFFICIENT_BALANCE", () => {
    const err = mapBodyError({
      error: { message: "insufficient balance to complete request" },
    });
    expect(err?.code).toBe(ErrorCodes.INSUFFICIENT_BALANCE);
    expect(err?.statusCode).toBe(402);
  });

  it("maps invalid-request hints to INVALID_REQUEST", () => {
    const err = mapBodyError({
      error: { message: "invalid_request: messages array is empty", type: "invalid_request_error" },
    });
    expect(err?.code).toBe(ErrorCodes.INVALID_REQUEST);
    expect(err?.statusCode).toBe(400);
  });

  it("falls back to PROVIDER_ERROR for uncategorised errors", () => {
    const err = mapBodyError({ error: { message: "something exploded upstream" } });
    expect(err?.code).toBe(ErrorCodes.PROVIDER_ERROR);
    expect(err?.statusCode).toBe(502);
  });

  it("handles flat-string error shape", () => {
    const err = mapBodyError({ error: "rate limit exceeded" });
    expect(err?.code).toBe(ErrorCodes.RATE_LIMITED);
  });
});

// ---------------------------------------------------------------
// 2. Adapter integration — each adapter must surface the EngineError
// ---------------------------------------------------------------

describe("OpenAICompatEngine HTTP 200 + body.error (F-RR2-03)", () => {
  it("throws EngineError on chatCompletions when body contains error", async () => {
    const adapter = new FakeOpenAI({
      error: { message: "Rate limit reached for model", code: "rate_limit_exceeded" },
    });
    await expect(
      adapter.chatCompletions(
        { model: "test-model", messages: [{ role: "user", content: "hi" }] },
        fakeRoute,
      ),
    ).rejects.toMatchObject({ code: ErrorCodes.RATE_LIMITED });
  });

  it("throws EngineError on imageGenerations when body contains error", async () => {
    const adapter = new FakeOpenAI({
      error: { message: "Authentication failed", code: "invalid_api_key" },
    });
    await expect(
      adapter.imageGenerations({ model: "test-model", prompt: "a cat" }, fakeRoute),
    ).rejects.toMatchObject({ code: ErrorCodes.AUTH_FAILED });
  });
});

describe("VolcengineAdapter HTTP 200 + body.error (F-RR2-03)", () => {
  it("throws on imageViaChat 200+error (first attempt) and surfaces after retries", async () => {
    const adapter = new FakeVolcengine({
      error: { message: "rate limit exceeded", code: "rate_limited" },
    });
    // volcengine's imageGenerations retries across sizes; the 200+error
    // must surface as an EngineError (wrapped) rather than succeed silently.
    await expect(
      adapter.imageGenerations({ model: "test-model", prompt: "cat", size: "1024x1024" }, fakeRoute),
    ).rejects.toBeInstanceOf(EngineError);
  });
});

describe("SiliconFlowAdapter HTTP 200 + body.error (F-RR2-03)", () => {
  it("throws EngineError on imageGenerations when body contains error", async () => {
    const adapter = new FakeSiliconFlow({
      error: { message: "insufficient balance", code: "balance_not_enough" },
    });
    await expect(
      adapter.imageGenerations({ model: "test-model", prompt: "a cat" }, fakeRoute),
    ).rejects.toMatchObject({ code: ErrorCodes.INSUFFICIENT_BALANCE });
  });
});
