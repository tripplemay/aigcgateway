/**
 * BL-EMBEDDING-MVP F-EM-01 — OpenAI compat embeddings adapter test.
 *
 * 覆盖：单条 / 批量 input、normalize 行为、buildUrl embedding 路径切换、
 * upstream 错误响应抛 EngineError。
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { OpenAICompatEngine } from "../openai-compat";
import { EngineError } from "../types";
import type { EmbeddingRequest, RouteResult } from "../types";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

function makeRoute(): RouteResult {
  return {
    channel: {
      id: "ch-emb-1",
      realModelId: "BAAI/bge-m3",
      providerId: "prov-sf",
    },
    provider: {
      name: "siliconflow",
      baseUrl: "https://api.siliconflow.cn/v1",
      proxyUrl: null,
      authConfig: { apiKey: "sk-test" },
    },
    config: {
      chatEndpoint: "/chat/completions",
      imageEndpoint: "/images/generations",
      quirks: [],
    },
    model: { id: "m-emb", name: "bge-m3", modality: "EMBEDDING" },
  } as unknown as RouteResult;
}

const singleInput: EmbeddingRequest = { model: "bge-m3", input: "hello world" };
const batchInput: EmbeddingRequest = {
  model: "bge-m3",
  input: ["hello", "world", "foo"],
};

describe("OpenAICompatEngine.embeddings (F-EM-01)", () => {
  it("single input → returns single data entry with embedding array", async () => {
    const responseBody = {
      object: "list",
      data: [{ object: "embedding", index: 0, embedding: [0.1, 0.2, 0.3] }],
      model: "BAAI/bge-m3",
      usage: { prompt_tokens: 5, total_tokens: 5 },
    };

    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify(responseBody), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const engine = new OpenAICompatEngine();
    const result = await engine.embeddings(singleInput, makeRoute());

    expect(result.object).toBe("list");
    expect(result.data).toHaveLength(1);
    expect(result.data[0].embedding).toEqual([0.1, 0.2, 0.3]);
    expect(result.data[0].index).toBe(0);
    expect(result.usage.prompt_tokens).toBe(5);
    expect(result.usage.total_tokens).toBe(5);

    // 验证 fetch URL 走 /embeddings 路径
    const firstCall = fetchMock.mock.calls[0] as unknown[] | undefined;
    expect(String(firstCall?.[0] ?? "")).toContain("/embeddings");
  });

  it("batch input → returns multiple data entries indexed in order", async () => {
    const responseBody = {
      object: "list",
      data: [
        { object: "embedding", index: 0, embedding: [0.1] },
        { object: "embedding", index: 1, embedding: [0.2] },
        { object: "embedding", index: 2, embedding: [0.3] },
      ],
      model: "BAAI/bge-m3",
      usage: { prompt_tokens: 12, total_tokens: 12 },
    };

    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify(responseBody), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ) as unknown as typeof fetch;

    const engine = new OpenAICompatEngine();
    const result = await engine.embeddings(batchInput, makeRoute());

    expect(result.data).toHaveLength(3);
    expect(result.data.map((d) => d.embedding)).toEqual([[0.1], [0.2], [0.3]]);
    expect(result.usage.prompt_tokens).toBe(12);
  });

  it("uses realModelId via resolveModelId in upstream body", async () => {
    let capturedBody = "";
    globalThis.fetch = vi.fn(async (_url: unknown, init: { body?: string } | undefined) => {
      capturedBody = init?.body ?? "";
      return new Response(
        JSON.stringify({
          object: "list",
          data: [{ embedding: [0.5], index: 0 }],
          model: "BAAI/bge-m3",
          usage: { prompt_tokens: 1, total_tokens: 1 },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const engine = new OpenAICompatEngine();
    await engine.embeddings(singleInput, makeRoute());

    const parsed = JSON.parse(capturedBody);
    expect(parsed.model).toBe("BAAI/bge-m3"); // realModelId, 不是 'bge-m3'
    expect(parsed.input).toBe("hello world");
  });

  it("HTTP 400 from upstream → throws EngineError", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ error: { message: "Invalid input", type: "invalid_request_error" } }),
          { status: 400 },
        ),
    ) as unknown as typeof fetch;

    const engine = new OpenAICompatEngine();
    await expect(engine.embeddings(singleInput, makeRoute())).rejects.toThrow(EngineError);
  });

  it("upstream returns body-level error → throws EngineError", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ error: { message: "Rate limited", type: "rate_limit_error" } }),
          { status: 200 },
        ),
    ) as unknown as typeof fetch;

    const engine = new OpenAICompatEngine();
    await expect(engine.embeddings(singleInput, makeRoute())).rejects.toThrow(EngineError);
  });

  it("missing usage in response → defaults to 0/0", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            object: "list",
            data: [{ embedding: [0.5], index: 0 }],
            model: "bge-m3",
            // no usage
          }),
          { status: 200 },
        ),
    ) as unknown as typeof fetch;

    const engine = new OpenAICompatEngine();
    const result = await engine.embeddings(singleInput, makeRoute());
    expect(result.usage.prompt_tokens).toBe(0);
    expect(result.usage.total_tokens).toBe(0);
  });

  it("upstream embedding field non-array → returns empty array (defensive)", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            object: "list",
            data: [{ embedding: null, index: 0 }],
            model: "bge-m3",
            usage: { prompt_tokens: 1, total_tokens: 1 },
          }),
          { status: 200 },
        ),
    ) as unknown as typeof fetch;

    const engine = new OpenAICompatEngine();
    const result = await engine.embeddings(singleInput, makeRoute());
    expect(result.data[0].embedding).toEqual([]);
  });

  it("encoding_format='float' is forwarded to upstream", async () => {
    let capturedBody = "";
    globalThis.fetch = vi.fn(async (_url: unknown, init: { body?: string } | undefined) => {
      capturedBody = init?.body ?? "";
      return new Response(
        JSON.stringify({
          object: "list",
          data: [{ embedding: [0.5], index: 0 }],
          model: "bge-m3",
          usage: { prompt_tokens: 1, total_tokens: 1 },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const engine = new OpenAICompatEngine();
    await engine.embeddings(
      { ...singleInput, encoding_format: "float" },
      makeRoute(),
    );
    expect(JSON.parse(capturedBody).encoding_format).toBe("float");
  });
});
