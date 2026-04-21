/**
 * BL-IMAGE-PARSER-FIX F-IPF-04 — end-to-end HTTP-layer regression.
 *
 * Round 1 took F-IPF-01's parser fix to production but shipped red: the
 * unit tests in image-via-chat.test.ts mocked `chatCompletions` directly,
 * bypassing `normalizeChatResponse` which was silently stripping the
 * `message.images` array. Tests passed, production kept logging
 * `[imageViaChat] extraction failed`.
 *
 * Lesson: for multi-layer extraction pipelines (fetch → normalize →
 * parse), the regression that proves the bug is fixed must mock at the
 * HTTP boundary so every intermediate layer is exercised against real
 * payload shapes.
 *
 * This test mocks `global.fetch` and feeds the exact OpenRouter envelope
 * captured from direct probes on 2026-04-21, then asserts the outer
 * `imageGenerations` call returns the extracted url — proving images[]
 * survives normalizeChatResponse, surfaces on ChatCompletionResponse, and
 * is picked up by imageViaChat Stage 0.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { OpenAICompatEngine } from "../openai-compat";
import type { ImageGenerationRequest, RouteResult } from "../types";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

// Route fixture matching the production openrouter channel config:
// chatEndpoint is present (so buildUrl falls into the chat branch), and
// image_via_chat_modalities quirk flips imageGenerations → imageViaChat.
function openrouterRoute(): RouteResult {
  return {
    channel: {
      id: "ch-or-1",
      realModelId: "openai/gpt-5-image",
      providerId: "prov-openrouter",
    },
    provider: {
      name: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      proxyUrl: null,
      authConfig: { apiKey: "sk-test" },
    },
    config: {
      chatEndpoint: "/chat/completions",
      imageEndpoint: "/images/generations",
      // getQuirks() accepts legacy array form or { flags: [...] }; we use
      // the array shape here because it's the simplest to fixture.
      quirks: ["image_via_chat_modalities"],
    },
    model: { id: "m-1", name: "gpt-5-image", modality: "IMAGE" },
  } as unknown as RouteResult;
}

const imageRequest: ImageGenerationRequest = {
  model: "gpt-5-image",
  prompt: "A dark blue world map with glowing cyan dots",
  size: "1024x1024",
};

describe("imageViaChat full pipeline — HTTP layer → normalize → Stage 0 (F-IPF-04)", () => {
  it("extracts data:url from OpenRouter message.images[] via global fetch mock", async () => {
    const expectedUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";
    // Exact shape captured from direct OpenRouter probe 2026-04-21. Note
    // images[] sits directly on message, not nested in content.
    const openrouterBody = {
      id: "gen-abc123",
      object: "chat.completion",
      created: 1_700_000_000,
      model: "openai/gpt-5-image",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: null,
            images: [{ type: "image_url", image_url: { url: expectedUrl } }],
          },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 0, total_tokens: 10, cost: 0.04 },
    };

    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify(openrouterBody), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const engine = new OpenAICompatEngine();
    const result = await engine.imageGenerations(imageRequest, openrouterRoute());

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.data).toEqual([{ url: expectedUrl }]);
    // Prove imageViaChat dispatched to the chat endpoint — the image
    // endpoint would have carried a different path. vi.fn() infers
    // mock.calls as `never[][]` without explicit generics, so coerce
    // via String() on a typed narrow instead of an `as string` cast.
    const firstCall = fetchMock.mock.calls[0] as unknown[] | undefined;
    const calledUrl = String(firstCall?.[0] ?? "");
    expect(calledUrl).toContain("/chat/completions");
  });

  it("regression: images[] absent but content has data URI → falls back to Stage 2 through full pipeline", async () => {
    const expectedUrl = "data:image/jpeg;base64,/9j/4AAQSkZJRg";
    const openrouterBody = {
      id: "gen-xyz",
      object: "chat.completion",
      created: 1_700_000_000,
      model: "openai/gpt-5-image",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            // No images[], fallback must reach Stage 2 base64 scan.
            content: `Sure, here it is: ${expectedUrl} hope it helps.`,
          },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 5, completion_tokens: 20, total_tokens: 25 },
    };

    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify(openrouterBody), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ) as unknown as typeof fetch;

    const engine = new OpenAICompatEngine();
    const result = await engine.imageGenerations(imageRequest, openrouterRoute());
    expect(result.data[0].url).toBe(expectedUrl);
  });
});
