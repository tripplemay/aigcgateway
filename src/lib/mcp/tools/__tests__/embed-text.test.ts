/**
 * BL-EMBEDDING-MVP F-EM-05 — MCP embed_text tool registration + handler.
 *
 * 静态契约 + handler 边界行为：
 *   - tool 在 server.ts 注册
 *   - 缺余额/项目时返回 isError
 *   - 非 EMBEDDING 模型返回 invalid_model_modality
 *   - 单条 + 批量 happy path
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const findUniqueUserMock = vi.fn();
const findUniqueProjectMock = vi.fn();
const findManyAliasMock = vi.fn();
const resolveEngineMock = vi.fn();
const checkRateLimitMock = vi.fn();
const checkTokenLimitMock = vi.fn();
const checkSpendingRateMock = vi.fn();
const processEmbeddingResultMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (a: unknown) => findUniqueUserMock(a) },
    project: { findUnique: (a: unknown) => findUniqueProjectMock(a) },
    modelAlias: { findMany: (a: unknown) => findManyAliasMock(a) },
  },
}));

vi.mock("@/lib/engine", () => ({
  resolveEngine: (m: string) => resolveEngineMock(m),
}));

vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: (...a: unknown[]) => checkRateLimitMock(...a),
  checkTokenLimit: (...a: unknown[]) => checkTokenLimitMock(...a),
  checkSpendingRate: (...a: unknown[]) => checkSpendingRateMock(...a),
}));

vi.mock("@/lib/api/post-process", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api/post-process")>("@/lib/api/post-process");
  return {
    ...actual,
    processEmbeddingResult: (p: unknown) => processEmbeddingResultMock(p),
    calculateTokenCost: () => ({ costUsd: 0.000035, sellUsd: 0.000042 }),
  };
});

vi.mock("@/lib/api/response", () => ({
  generateTraceId: () => "trc_test_emb",
}));

import { registerEmbedText } from "../embed-text";

describe("embed_text static contract (F-EM-05)", () => {
  it("is registered in src/lib/mcp/server.ts", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../server.ts"),
      "utf8",
    );
    expect(source).toMatch(/registerEmbedText\s*\(\s*server\s*,\s*opts\s*\)/);
    expect(source).toMatch(/from\s+"\.\/tools\/embed-text"/);
  });

  it("imports processEmbeddingResult from post-process", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../embed-text.ts"),
      "utf8",
    );
    expect(source).toMatch(/processEmbeddingResult/);
  });
});

// 简化：用 fake server 捕获 tool definition + 直接调用 handler
type ToolHandler = (args: { model: string; input: string | string[] }) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

interface FakeServer {
  registered: Array<{
    name: string;
    description: string;
    schema: Record<string, unknown>;
    handler: ToolHandler;
  }>;
  tool: (
    name: string,
    description: string,
    schema: Record<string, unknown>,
    handler: ToolHandler,
  ) => void;
}

function makeFakeServer(): FakeServer {
  const registered: FakeServer["registered"] = [];
  return {
    registered,
    tool: (name, description, schema, handler) => {
      registered.push({ name, description, schema, handler });
    },
  };
}

const opts = {
  userId: "u1",
  projectId: "p1",
  apiKeyId: "k1",
  permissions: { chatCompletion: true } as Record<string, boolean>,
  keyRateLimit: null,
};

beforeEach(() => {
  findUniqueUserMock.mockReset();
  findUniqueProjectMock.mockReset();
  findManyAliasMock.mockReset();
  resolveEngineMock.mockReset();
  checkRateLimitMock.mockReset();
  checkTokenLimitMock.mockReset();
  checkSpendingRateMock.mockReset();
  processEmbeddingResultMock.mockReset();

  findUniqueUserMock.mockResolvedValue({ id: "u1", balance: 10, rateLimit: null });
  findUniqueProjectMock.mockResolvedValue({ id: "p1", rateLimit: null });
  findManyAliasMock.mockResolvedValue([]);
  checkRateLimitMock.mockResolvedValue({
    ok: true,
    headers: {},
    rateLimitKey: "k",
    rateLimitMember: "m",
  });
  checkTokenLimitMock.mockResolvedValue({ ok: true });
  checkSpendingRateMock.mockResolvedValue({ ok: true });
});

describe("embed_text handler", () => {
  it("zero balance → isError + insufficient_balance", async () => {
    findUniqueUserMock.mockResolvedValueOnce({ id: "u1", balance: 0, rateLimit: null });
    const server = makeFakeServer();
    registerEmbedText(
      server as unknown as Parameters<typeof registerEmbedText>[0],
      opts as unknown as Parameters<typeof registerEmbedText>[1],
    );
    const handler = server.registered[0].handler;

    const res = await handler({ model: "bge-m3", input: "hi" });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("insufficient_balance");
  });

  it("non-EMBEDDING model → isError + invalid_model_modality", async () => {
    resolveEngineMock.mockResolvedValueOnce({
      route: {
        channel: { id: "c1" },
        model: { id: "m1", name: "gpt-4o", modality: "TEXT" },
        provider: { name: "openai" },
        config: {},
        alias: null,
      },
      adapter: { embeddings: vi.fn() },
    });
    const server = makeFakeServer();
    registerEmbedText(
      server as unknown as Parameters<typeof registerEmbedText>[0],
      opts as unknown as Parameters<typeof registerEmbedText>[1],
    );
    const handler = server.registered[0].handler;

    const res = await handler({ model: "gpt-4o", input: "hi" });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("invalid_model_modality");
  });

  it("single input happy path → returns embedding + processEmbeddingResult called", async () => {
    const fakeVec = [0.1, 0.2, 0.3];
    resolveEngineMock.mockResolvedValueOnce({
      route: {
        channel: { id: "c1" },
        model: { id: "m1", name: "bge-m3", modality: "EMBEDDING" },
        provider: { name: "siliconflow" },
        config: {},
        alias: { sellPrice: { unit: "token", inputPer1M: 0.084, outputPer1M: 0 } },
      },
      adapter: {
        embeddings: vi.fn(async () => ({
          object: "list",
          data: [{ object: "embedding", index: 0, embedding: fakeVec }],
          model: "BAAI/bge-m3",
          usage: { prompt_tokens: 5, total_tokens: 5 },
        })),
      },
    });

    const server = makeFakeServer();
    registerEmbedText(
      server as unknown as Parameters<typeof registerEmbedText>[0],
      opts as unknown as Parameters<typeof registerEmbedText>[1],
    );
    const handler = server.registered[0].handler;

    const res = await handler({ model: "bge-m3", input: "hello" });
    expect(res.isError).toBeFalsy();
    const json = JSON.parse(res.content[0].text);
    expect(json.data).toHaveLength(1);
    expect(json.data[0].embedding).toEqual(fakeVec);
    expect(json.data[0].dimensions).toBe(3);
    expect(json.usage.promptTokens).toBe(5);
    expect(json.traceId).toBe("trc_test_emb");
    expect(processEmbeddingResultMock).toHaveBeenCalledOnce();
  });

  it("batch input → returns N entries", async () => {
    resolveEngineMock.mockResolvedValueOnce({
      route: {
        channel: { id: "c1" },
        model: { id: "m1", name: "bge-m3", modality: "EMBEDDING" },
        provider: { name: "siliconflow" },
        config: {},
        alias: null,
      },
      adapter: {
        embeddings: vi.fn(async () => ({
          object: "list",
          data: [
            { object: "embedding", index: 0, embedding: [0.1] },
            { object: "embedding", index: 1, embedding: [0.2] },
          ],
          model: "BAAI/bge-m3",
          usage: { prompt_tokens: 8, total_tokens: 8 },
        })),
      },
    });
    const server = makeFakeServer();
    registerEmbedText(
      server as unknown as Parameters<typeof registerEmbedText>[0],
      opts as unknown as Parameters<typeof registerEmbedText>[1],
    );
    const handler = server.registered[0].handler;

    const res = await handler({ model: "bge-m3", input: ["a", "b"] });
    expect(res.isError).toBeFalsy();
    const json = JSON.parse(res.content[0].text);
    expect(json.data).toHaveLength(2);
  });
});
