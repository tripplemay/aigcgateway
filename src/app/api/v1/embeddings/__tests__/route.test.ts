/**
 * BL-EMBEDDING-MVP F-EM-02 — POST /v1/embeddings route test.
 *
 * 覆盖：
 *   - 鉴权失败 → 401
 *   - 缺 model → 400
 *   - 缺 input / 空 input → 400
 *   - 批量 input 超 100 / 非字符串 → 400
 *   - 非 EMBEDDING modality → 400 invalid_model_modality
 *   - 单条 / 批量 happy path → 200 + processEmbeddingResult 被调用
 *   - upstream EngineError → mapped 错误码
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const authMock = vi.fn();
const checkBalanceMock = vi.fn();
const checkRateLimitMock = vi.fn();
const checkTokenLimitMock = vi.fn();
const checkSpendingRateMock = vi.fn();
const rollbackRateLimitMock = vi.fn();
const resolveEngineMock = vi.fn();
const processEmbeddingResultMock = vi.fn();

vi.mock("@/lib/api/auth-middleware", () => ({
  authenticateApiKey: (req: Request) => authMock(req),
}));

vi.mock("@/lib/api/balance-middleware", () => ({
  checkBalance: (u: unknown) => checkBalanceMock(u),
}));

vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimitMock(...args),
  checkTokenLimit: (...args: unknown[]) => checkTokenLimitMock(...args),
  checkSpendingRate: (...args: unknown[]) => checkSpendingRateMock(...args),
  rollbackRateLimit: (...args: unknown[]) => rollbackRateLimitMock(...args),
}));

vi.mock("@/lib/engine", () => ({
  resolveEngine: (model: string) => resolveEngineMock(model),
}));

vi.mock("@/lib/api/post-process", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api/post-process")>("@/lib/api/post-process");
  return {
    ...actual,
    processEmbeddingResult: (params: unknown) => processEmbeddingResultMock(params),
    calculateTokenCost: () => ({ costUsd: 0.000035, sellUsd: 0.000042 }),
  };
});

import { POST } from "../route";

const validUser = {
  id: "u1",
  defaultProjectId: "p1",
  rateLimit: null,
};
const validProject = { id: "p1", rateLimit: null };
const validApiKey = { id: "k1", rateLimit: null };

const okAuth = {
  ok: true,
  ctx: { user: validUser, project: validProject, apiKey: validApiKey },
};

function makeReq(body: unknown): Request {
  return new Request("https://example.com/v1/embeddings", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", authorization: "Bearer pk_test" },
  });
}

function embeddingRoute() {
  return {
    route: {
      channel: { id: "ch1" },
      model: { id: "m1", name: "bge-m3", modality: "EMBEDDING" },
      provider: { name: "siliconflow" },
      config: {},
      alias: null,
    },
    adapter: {
      embeddings: vi.fn(async () => ({
        object: "list",
        data: [{ object: "embedding", index: 0, embedding: [0.1, 0.2, 0.3] }],
        model: "BAAI/bge-m3",
        usage: { prompt_tokens: 5, total_tokens: 5 },
      })),
    },
    candidates: [],
  };
}

beforeEach(() => {
  authMock.mockReset();
  checkBalanceMock.mockReset();
  checkRateLimitMock.mockReset();
  checkTokenLimitMock.mockReset();
  checkSpendingRateMock.mockReset();
  rollbackRateLimitMock.mockReset();
  resolveEngineMock.mockReset();
  processEmbeddingResultMock.mockReset();

  authMock.mockResolvedValue(okAuth);
  checkBalanceMock.mockReturnValue({ ok: true });
  checkRateLimitMock.mockResolvedValue({
    ok: true,
    headers: {},
    rateLimitKey: "k",
    rateLimitMember: "m",
  });
  checkTokenLimitMock.mockResolvedValue({ ok: true });
  checkSpendingRateMock.mockResolvedValue({ ok: true });
  rollbackRateLimitMock.mockResolvedValue(undefined);
});

describe("POST /v1/embeddings — input validation", () => {
  it("auth failure → returns 401", async () => {
    authMock.mockResolvedValueOnce({
      ok: false,
      error: new Response("unauth", { status: 401 }),
    });

    const res = await POST(makeReq({ model: "bge-m3", input: "hi" }));
    expect(res.status).toBe(401);
  });

  it("missing model → 400 invalid_parameter", async () => {
    const res = await POST(makeReq({ input: "hi" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error?.code).toBe("invalid_parameter");
  });

  it("missing input → 400", async () => {
    const res = await POST(makeReq({ model: "bge-m3" }));
    expect(res.status).toBe(400);
  });

  it("empty string input → 400", async () => {
    const res = await POST(makeReq({ model: "bge-m3", input: "" }));
    expect(res.status).toBe(400);
  });

  it("empty array input → 400", async () => {
    const res = await POST(makeReq({ model: "bge-m3", input: [] }));
    expect(res.status).toBe(400);
  });

  it("array > 100 inputs → 400", async () => {
    const arr = Array(101).fill("x");
    const res = await POST(makeReq({ model: "bge-m3", input: arr }));
    expect(res.status).toBe(400);
  });

  it("array containing non-string → 400", async () => {
    const res = await POST(makeReq({ model: "bge-m3", input: ["ok", 123, "ok"] }));
    expect(res.status).toBe(400);
  });

  it("input neither string nor array → 400", async () => {
    const res = await POST(makeReq({ model: "bge-m3", input: { x: 1 } }));
    expect(res.status).toBe(400);
  });

  it("invalid JSON body → 400", async () => {
    const req = new Request("https://example.com/v1/embeddings", {
      method: "POST",
      body: "not-json",
      headers: { "content-type": "application/json", authorization: "Bearer pk_test" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe("POST /v1/embeddings — modality + adapter checks", () => {
  it("non-EMBEDDING modality model → 400 invalid_model_modality", async () => {
    resolveEngineMock.mockResolvedValueOnce({
      route: {
        channel: { id: "ch1" },
        model: { id: "m1", name: "gpt-4o", modality: "TEXT" },
        provider: { name: "openai" },
        config: {},
        alias: null,
      },
      adapter: { embeddings: vi.fn() },
      candidates: [],
    });

    const res = await POST(makeReq({ model: "gpt-4o", input: "hi" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error?.code).toBe("invalid_model_modality");
  });

  it("adapter without embeddings() → 502", async () => {
    resolveEngineMock.mockResolvedValueOnce({
      route: {
        channel: { id: "ch1" },
        model: { id: "m1", name: "bge-m3", modality: "EMBEDDING" },
        provider: { name: "siliconflow" },
        config: {},
        alias: null,
      },
      adapter: {}, // no embeddings method
      candidates: [],
    });

    const res = await POST(makeReq({ model: "bge-m3", input: "hi" }));
    expect(res.status).toBe(502);
  });
});

describe("POST /v1/embeddings — happy path", () => {
  it("single string input → 200 + 1 data entry + processEmbeddingResult called", async () => {
    resolveEngineMock.mockResolvedValueOnce(embeddingRoute());

    const res = await POST(makeReq({ model: "bge-m3", input: "hello" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].embedding).toEqual([0.1, 0.2, 0.3]);
    expect(body.model).toBe("bge-m3"); // 客户端 canonical name
    expect(typeof body.cost).toBe("string");
    expect(body.cost).toMatch(/^\$/);

    expect(processEmbeddingResultMock).toHaveBeenCalledTimes(1);
    const ppCall = processEmbeddingResultMock.mock.calls[0][0];
    expect(ppCall.modelName).toBe("bge-m3");
    expect(ppCall.requestParams.input_type).toBe("single");
    expect(ppCall.requestParams.input_count).toBe(1);
  });

  it("batch input → 200 + processEmbeddingResult input_count=N", async () => {
    const r = embeddingRoute();
    r.adapter.embeddings = vi.fn(async () => ({
      object: "list",
      data: [
        { object: "embedding", index: 0, embedding: [0.1] },
        { object: "embedding", index: 1, embedding: [0.2] },
        { object: "embedding", index: 2, embedding: [0.3] },
      ],
      model: "BAAI/bge-m3",
      usage: { prompt_tokens: 12, total_tokens: 12 },
    }));
    resolveEngineMock.mockResolvedValueOnce(r);

    const res = await POST(makeReq({ model: "bge-m3", input: ["a", "b", "c"] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(3);

    const ppCall = processEmbeddingResultMock.mock.calls[0][0];
    expect(ppCall.requestParams.input_type).toBe("batch");
    expect(ppCall.requestParams.input_count).toBe(3);
  });

  it("upstream throws EngineError → returns mapped error + processEmbeddingResult called with error", async () => {
    const { EngineError } = await import("@/lib/engine/types");
    const r = embeddingRoute();
    r.adapter.embeddings = vi.fn(async () => {
      throw new EngineError("Rate limit", "rate_limited", 429);
    });
    resolveEngineMock.mockResolvedValueOnce(r);

    const res = await POST(makeReq({ model: "bge-m3", input: "hi" }));
    expect(res.status).toBe(429);

    expect(processEmbeddingResultMock).toHaveBeenCalledTimes(1);
    const ppCall = processEmbeddingResultMock.mock.calls[0][0];
    expect(ppCall.error).toBeDefined();
  });
});
