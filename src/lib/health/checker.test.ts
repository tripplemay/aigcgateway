import { describe, it, expect, vi } from "vitest";
import { runCallProbe } from "./checker";
import type { RouteResult } from "../engine/types";

vi.mock("../engine/router", () => ({
  getAdapterForRoute: () => ({
    chatCompletions: vi.fn().mockResolvedValue({
      choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }),
    imageGenerations: vi.fn().mockResolvedValue({ data: [{ url: "http://example.com/x.png" }] }),
    chatCompletionsStream: vi.fn(),
  }),
}));

const baseRoute = (modality: "TEXT" | "IMAGE"): RouteResult =>
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
});
