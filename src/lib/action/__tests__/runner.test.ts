/**
 * BL-EMBEDDING-MVP F-EM-03 — Action runner modality branch test.
 *
 * 覆盖：
 *   1) chat action (modality:'TEXT') runActionNonStream → 走 chatCompletions
 *   2) embedding action (modality:'EMBEDDING') runActionNonStream → 走 embeddings
 *   3) embedding action runAction(stream) → 写 SSE embedding event + 返回向量
 *   4) embedding action 但 adapter 无 embeddings 方法 → throw 502
 *   5) modality mismatch（不在 runner 验证；create_action 时验证；不在此测）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const findFirstActionMock = vi.fn();
const findFirstVersionMock = vi.fn();
const resolveEngineMock = vi.fn();
const processChatResultMock = vi.fn();
const processEmbeddingResultMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    action: { findFirst: (a: unknown) => findFirstActionMock(a) },
    actionVersion: { findFirst: (a: unknown) => findFirstVersionMock(a) },
  },
}));

vi.mock("@/lib/engine", () => ({
  resolveEngine: (m: string) => resolveEngineMock(m),
}));

vi.mock("@/lib/api/post-process", () => ({
  processChatResult: (p: unknown) => processChatResultMock(p),
  processEmbeddingResult: (p: unknown) => processEmbeddingResultMock(p),
}));

vi.mock("@/lib/api/response", () => ({
  generateTraceId: () => "trc_test",
}));

import { runAction, runActionNonStream } from "../runner";

beforeEach(() => {
  findFirstActionMock.mockReset();
  findFirstVersionMock.mockReset();
  resolveEngineMock.mockReset();
  processChatResultMock.mockReset();
  processEmbeddingResultMock.mockReset();

  findFirstVersionMock.mockResolvedValue({
    id: "v1",
    actionId: "a1",
    versionNumber: 1,
    messages: [{ role: "user", content: "hello {{name}}" }],
    variables: [{ name: "name", required: true }],
  });
});

const params = {
  actionId: "a1",
  projectId: "p1",
  userId: "u1",
  variables: { name: "world" },
  source: "api" as const,
};

describe("runActionNonStream — chat path (regression)", () => {
  it("modality TEXT → chatCompletions called, processChatResult invoked, output text", async () => {
    findFirstActionMock.mockResolvedValueOnce({
      id: "a1",
      activeVersionId: "v1",
      model: "gpt-4o",
      modality: "TEXT",
    });
    const chatCompletionsFn = vi.fn(async () => ({
      id: "x",
      object: "chat.completion",
      created: 0,
      model: "gpt-4o",
      choices: [
        { index: 0, message: { role: "assistant", content: "hi world" }, finish_reason: "stop" },
      ],
      usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
    }));
    resolveEngineMock.mockResolvedValueOnce({
      route: { channel: { id: "c1" }, model: { name: "gpt-4o" }, alias: null, config: {} },
      adapter: { chatCompletions: chatCompletionsFn, embeddings: undefined },
    });

    const result = await runActionNonStream(params);
    expect(result.output).toBe("hi world");
    expect(result.modality).toBe("TEXT");
    expect(result.embedding).toBeUndefined();
    expect(chatCompletionsFn).toHaveBeenCalledOnce();
    expect(processChatResultMock).toHaveBeenCalledOnce();
    expect(processEmbeddingResultMock).not.toHaveBeenCalled();
  });
});

describe("runActionNonStream — embedding path", () => {
  it("modality EMBEDDING → adapter.embeddings called, returns vector + dimensions", async () => {
    findFirstActionMock.mockResolvedValueOnce({
      id: "a1",
      activeVersionId: "v1",
      model: "bge-m3",
      modality: "EMBEDDING",
    });
    const fakeVector = new Array(1024).fill(0).map((_, i) => i / 1024);
    const embeddingsFn = vi.fn(async () => ({
      object: "list",
      data: [{ object: "embedding", index: 0, embedding: fakeVector }],
      model: "BAAI/bge-m3",
      usage: { prompt_tokens: 5, total_tokens: 5 },
    }));
    resolveEngineMock.mockResolvedValueOnce({
      route: {
        channel: { id: "c1" },
        model: { name: "bge-m3", modality: "EMBEDDING" },
        alias: null,
        config: {},
      },
      adapter: { chatCompletions: vi.fn(), embeddings: embeddingsFn },
    });

    const result = await runActionNonStream(params);
    expect(result.modality).toBe("EMBEDDING");
    expect(result.dimensions).toBe(1024);
    expect(result.embedding).toHaveLength(1024);
    expect(result.output).toBe("");
    expect(result.usage?.prompt_tokens).toBe(5);
    expect(result.usage?.completion_tokens).toBe(0);
    expect(embeddingsFn).toHaveBeenCalledOnce();
    expect(processEmbeddingResultMock).toHaveBeenCalledOnce();
    expect(processChatResultMock).not.toHaveBeenCalled();

    // 校验 adapter.embeddings 被调用时拿到注入后的 input
    const calls = embeddingsFn.mock.calls as unknown as Array<[{ model: string; input: string }]>;
    expect(calls[0]?.[0]?.model).toBe("bge-m3");
    expect(calls[0]?.[0]?.input).toBe("hello world"); // {{name}} → world
  });

  it("EMBEDDING action but adapter has no embeddings method → throws InjectionError 502", async () => {
    findFirstActionMock.mockResolvedValueOnce({
      id: "a1",
      activeVersionId: "v1",
      model: "bge-m3",
      modality: "EMBEDDING",
    });
    resolveEngineMock.mockResolvedValueOnce({
      route: { channel: { id: "c1" }, model: { name: "bge-m3" }, alias: null, config: {} },
      adapter: { chatCompletions: vi.fn() }, // no embeddings
    });

    await expect(runActionNonStream(params)).rejects.toThrow(/does not support embeddings/i);
    // chat 路径的 processChatResult 不应被调用
    expect(processChatResultMock).not.toHaveBeenCalled();
  });

  it("EMBEDDING action upstream error → processEmbeddingResult called with error + rethrows", async () => {
    findFirstActionMock.mockResolvedValueOnce({
      id: "a1",
      activeVersionId: "v1",
      model: "bge-m3",
      modality: "EMBEDDING",
    });
    const embeddingsFn = vi.fn(async () => {
      throw new Error("upstream 502");
    });
    resolveEngineMock.mockResolvedValueOnce({
      route: { channel: { id: "c1" }, model: { name: "bge-m3" }, alias: null, config: {} },
      adapter: { chatCompletions: vi.fn(), embeddings: embeddingsFn },
    });

    await expect(runActionNonStream(params)).rejects.toThrow("upstream 502");
    expect(processEmbeddingResultMock).toHaveBeenCalledOnce();
    expect(processEmbeddingResultMock.mock.calls[0][0].error.message).toBe("upstream 502");
  });
});

describe("runAction (stream) — embedding path", () => {
  it("modality EMBEDDING → writes SSE 'embedding' event + 'action_end' + returns vector", async () => {
    findFirstActionMock.mockResolvedValueOnce({
      id: "a1",
      activeVersionId: "v1",
      model: "bge-m3",
      modality: "EMBEDDING",
    });
    const fakeVector = [0.1, 0.2, 0.3];
    const embeddingsFn = vi.fn(async () => ({
      object: "list",
      data: [{ object: "embedding", index: 0, embedding: fakeVector }],
      model: "BAAI/bge-m3",
      usage: { prompt_tokens: 3, total_tokens: 3 },
    }));
    resolveEngineMock.mockResolvedValueOnce({
      route: {
        channel: { id: "c1" },
        model: { name: "bge-m3", modality: "EMBEDDING" },
        alias: null,
        config: {},
      },
      adapter: { chatCompletions: vi.fn(), embeddings: embeddingsFn },
    });

    const writes: string[] = [];
    const write = (data: string) => writes.push(data);

    const result = await runAction(params, write);
    expect(result.modality).toBe("EMBEDDING");
    expect(result.embedding).toEqual(fakeVector);
    expect(result.dimensions).toBe(3);

    // SSE 事件序列：action_start → embedding → action_end
    const events = writes.map((w) => JSON.parse(w));
    expect(events[0].type).toBe("action_start");
    expect(events[0].modality).toBe("EMBEDDING");
    expect(events.find((e) => e.type === "embedding")?.embedding).toEqual(fakeVector);
    expect(events.find((e) => e.type === "action_end")?.modality).toBe("EMBEDDING");
    expect(events.some((e) => e.type === "content")).toBe(false); // 不应该有 chat 风格的 content
  });

  it("modality EMBEDDING + adapter no embeddings → writes 'error' SSE + throws", async () => {
    findFirstActionMock.mockResolvedValueOnce({
      id: "a1",
      activeVersionId: "v1",
      model: "bge-m3",
      modality: "EMBEDDING",
    });
    resolveEngineMock.mockResolvedValueOnce({
      route: { channel: { id: "c1" }, model: { name: "bge-m3" }, alias: null, config: {} },
      adapter: { chatCompletions: vi.fn() }, // no embeddings
    });

    const writes: string[] = [];
    await expect(runAction(params, (d) => writes.push(d))).rejects.toThrow(
      /does not support embeddings/i,
    );
    const errEvent = writes.map((w) => JSON.parse(w)).find((e) => e.type === "error");
    expect(errEvent).toBeDefined();
  });
});
