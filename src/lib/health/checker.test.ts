import { describe, it, expect, vi, beforeEach } from "vitest";
import { runCallProbe } from "./checker";
import type { RouteResult } from "../engine/types";

const chatCompletionsMock = vi.fn();
const imageGenerationsMock = vi.fn();
const embeddingsMock = vi.fn();

beforeEach(() => {
  chatCompletionsMock.mockReset();
  imageGenerationsMock.mockReset();
  embeddingsMock.mockReset();
  // 默认 PASS 形态（per-test 可 mockResolvedValueOnce 覆盖）
  chatCompletionsMock.mockResolvedValue({
    choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  });
  imageGenerationsMock.mockResolvedValue({ data: [{ url: "http://example.com/x.png" }] });
});

vi.mock("../engine/router", () => ({
  getAdapterForRoute: () => ({
    chatCompletions: chatCompletionsMock,
    imageGenerations: imageGenerationsMock,
    embeddings: embeddingsMock,
    chatCompletionsStream: vi.fn(),
  }),
}));

const baseRoute = (modality: "TEXT" | "IMAGE" | "EMBEDDING"): RouteResult =>
  ({
    channel: { id: "ch-1" },
    provider: { name: "p" },
    config: {},
    model: { id: "m-1", name: "test-model", modality, supportedSizes: ["1024x1024"] },
    alias: { modality },
  }) as unknown as RouteResult;

describe("runCallProbe (F-ACF-10)", () => {
  it("returns PASS for a TEXT model with valid choices", async () => {
    const result = await runCallProbe(baseRoute("TEXT"));
    expect(result.level).toBe("CALL_PROBE");
    expect(result.result).toBe("PASS");
  });

  it("returns PASS for an IMAGE model with non-empty data", async () => {
    const result = await runCallProbe(baseRoute("IMAGE"));
    expect(result.level).toBe("CALL_PROBE");
    expect(result.result).toBe("PASS");
  });

  // BL-EMBEDDING-MVP fix-round-2: EMBEDDING modality probe routing
  describe("EMBEDDING modality (fix-round-2)", () => {
    it("returns PASS when adapter.embeddings returns data", async () => {
      embeddingsMock.mockResolvedValueOnce({
        object: "list",
        data: [{ object: "embedding", index: 0, embedding: [0.1, 0.2, 0.3] }],
        model: "bge-m3",
        usage: { prompt_tokens: 1, total_tokens: 1 },
      });
      const result = await runCallProbe(baseRoute("EMBEDDING"));
      expect(result.level).toBe("CALL_PROBE");
      expect(result.result).toBe("PASS");
      expect(embeddingsMock).toHaveBeenCalledWith(
        expect.objectContaining({ model: "test-model", input: "hi" }),
        expect.anything(),
      );
      // 必须不再走 chat path（fix-round-2 根因 — 原 isImage/else=chat 二分让
      // EMBEDDING 错误地走 chatCompletions → 上游 400）
      expect(chatCompletionsMock).not.toHaveBeenCalled();
    });

    it("returns FAIL with sanitized error when adapter.embeddings throws", async () => {
      embeddingsMock.mockRejectedValueOnce(new Error("upstream 502"));
      const result = await runCallProbe(baseRoute("EMBEDDING"));
      expect(result.level).toBe("CALL_PROBE");
      expect(result.result).toBe("FAIL");
      expect(result.errorMessage).toBe("upstream 502");
    });

    it("returns FAIL when adapter.embeddings returns empty data", async () => {
      embeddingsMock.mockResolvedValueOnce({
        object: "list",
        data: [],
        model: "bge-m3",
        usage: { prompt_tokens: 0, total_tokens: 0 },
      });
      const result = await runCallProbe(baseRoute("EMBEDDING"));
      expect(result.result).toBe("FAIL");
      expect(result.errorMessage).toMatch(/zero embeddings/i);
    });
  });
});
