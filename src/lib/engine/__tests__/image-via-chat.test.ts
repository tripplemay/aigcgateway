/**
 * BL-IMAGE-PARSER-FIX F-IPF-02 — imageViaChat extraction regression.
 *
 * Stage 0 (new, this batch) recognises OpenRouter image models that
 * return `message.images[]` — confirmed shape from 2026-04-21 direct
 * probes against openai/gpt-5-image, openai/gpt-5-image-mini, and
 * google/gemini-3-pro-image-preview:
 *
 *   message = {
 *     role: 'assistant',
 *     content: null | '',
 *     images: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,...' } }]
 *   }
 *
 * Stages 1-4 (existing) remain untouched and continue to cover:
 *   1. multimodal parts (older OpenAI gpt-image, native Gemini inline_data)
 *   2. base64 data URI embedded in content string
 *   3. URL with image extension
 *   4. any https URL (Google Storage etc.)
 *
 * Test cases pin Stage 0 precedence and the 4 fallback paths.
 */
import { describe, it, expect, vi } from "vitest";
import { OpenAICompatEngine } from "../openai-compat";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ImageGenerationRequest,
  ImageGenerationResponse,
  RouteResult,
} from "../types";

// Test-only subclass: exposes the protected imageViaChat so we can drive
// it directly with a stubbed chatCompletions. The real engine wires this
// method as part of its public image generation path.
class TestEngine extends OpenAICompatEngine {
  private readonly chatStub: (req: ChatCompletionRequest) => Promise<ChatCompletionResponse>;
  constructor(chatStub: (req: ChatCompletionRequest) => Promise<ChatCompletionResponse>) {
    super();
    this.chatStub = chatStub;
  }
  // Override to bypass the real network/fetch path.
  async chatCompletions(
    req: ChatCompletionRequest,
    _route: RouteResult,
  ): Promise<ChatCompletionResponse> {
    return this.chatStub(req);
  }
  // Expose protected `imageViaChat` for direct exercise.
  public runImageViaChat(
    request: ImageGenerationRequest,
    route: RouteResult,
  ): Promise<ImageGenerationResponse> {
    // @ts-expect-error — deliberately reaching into protected method
    return this.imageViaChat(request, route);
  }
}

const baseRoute = (): RouteResult =>
  ({
    channel: {
      id: "ch-1",
      realModelId: "gpt-5-image",
      providerId: "prov-openrouter",
    },
    provider: { name: "openrouter", config: {} },
    config: {},
    model: { id: "m-1", name: "gpt-5-image", modality: "IMAGE" },
  }) as unknown as RouteResult;

function chatResponse(message: Record<string, unknown>): ChatCompletionResponse {
  return {
    id: "chatcmpl-test",
    object: "chat.completion",
    created: 1_700_000_000,
    model: "gpt-5-image",
    choices: [{ index: 0, message, finish_reason: "stop" }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  } as unknown as ChatCompletionResponse;
}

const imageRequest: ImageGenerationRequest = {
  model: "gpt-5-image",
  prompt: "A red square",
};

describe("imageViaChat Stage 0 (F-IPF-01)", () => {
  it("(a) extracts url from message.images[].image_url.url when content is null", async () => {
    const url = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";
    const stub = vi.fn(async () =>
      chatResponse({
        role: "assistant",
        content: null,
        images: [{ type: "image_url", image_url: { url } }],
      }),
    );
    const engine = new TestEngine(stub);
    const result = await engine.runImageViaChat(imageRequest, baseRoute());
    expect(result.data).toEqual([{ url }]);
    expect(stub).toHaveBeenCalledOnce();
  });

  it("(b) Stage 0 takes precedence over content string (Gemini-like response)", async () => {
    const url = "data:image/png;base64,AAAA";
    const stub = vi.fn(async () =>
      chatResponse({
        role: "assistant",
        // Gemini-style responses sometimes include narration text alongside
        // the image. Stage 0 must prefer the images[] entry, not parse text.
        content: "Here is the requested map, in dark blue tones.",
        images: [{ type: "image_url", image_url: { url } }],
      }),
    );
    const engine = new TestEngine(stub);
    const result = await engine.runImageViaChat(imageRequest, baseRoute());
    expect(result.data).toEqual([{ url }]);
  });
});

describe("imageViaChat Stages 1-4 fallback (unchanged by F-IPF-01)", () => {
  it("(c) Stage 1 multimodal parts — images absent → parses content[].image_url", async () => {
    const url = "https://example.com/generated.png";
    const stub = vi.fn(async () =>
      chatResponse({
        role: "assistant",
        content: [{ type: "image_url", image_url: { url } }],
      }),
    );
    const engine = new TestEngine(stub);
    const result = await engine.runImageViaChat(imageRequest, baseRoute());
    expect(result.data).toEqual([{ url }]);
  });

  it("(d) Stage 2 base64 data URI inside content string → extracted", async () => {
    const url = "data:image/jpeg;base64,/9j/4AAQSkZJRg";
    const stub = vi.fn(async () =>
      chatResponse({
        role: "assistant",
        content: `Here is your image: ${url} (done)`,
      }),
    );
    const engine = new TestEngine(stub);
    const result = await engine.runImageViaChat(imageRequest, baseRoute());
    expect(result.data[0].url).toBe(url);
  });

  it("(e) no image anywhere → throws engine error with no_image_in_response code", async () => {
    const stub = vi.fn(async () =>
      chatResponse({
        role: "assistant",
        content: "Sorry I can't generate images right now",
      }),
    );
    const engine = new TestEngine(stub);
    // sanitizeErrorMessage converts "returned no extractable image" into
    // the user-facing "did not return a valid image" wording; the raw
    // provider error is still accessible via .providerError for diagnostics.
    await expect(engine.runImageViaChat(imageRequest, baseRoute())).rejects.toMatchObject({
      message: expect.stringContaining("did not return a valid image"),
    });
  });

  it("(f) images is an empty array → falls through to Stage 1-4 (here throws, text only)", async () => {
    const stub = vi.fn(async () =>
      chatResponse({
        role: "assistant",
        images: [], // Present but empty — must not short-circuit success.
        content: "no image yet",
      }),
    );
    const engine = new TestEngine(stub);
    // sanitizeErrorMessage converts "returned no extractable image" into
    // the user-facing "did not return a valid image" wording; the raw
    // provider error is still accessible via .providerError for diagnostics.
    await expect(engine.runImageViaChat(imageRequest, baseRoute())).rejects.toMatchObject({
      message: expect.stringContaining("did not return a valid image"),
    });
  });
});
