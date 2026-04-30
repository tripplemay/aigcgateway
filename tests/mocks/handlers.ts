/**
 * Default MSW handlers for the upstream HTTP surfaces aigcgateway calls.
 *
 * Mocked upstreams (OpenAI-compatible + Anthropic native):
 *   - OpenAI       chat.completions / embeddings / images.generations / models
 *   - OpenRouter   chat.completions / embeddings / models / activity
 *   - Anthropic    messages / models
 *   - SiliconFlow  embeddings (OpenAI-compatible) / chat.completions
 *
 * Tests that need to assert error paths or specific bodies call
 *   `server.use(http.post(...).once(...))`
 * to override defaults for a single request.
 *
 * URL strategy: production code reads the upstream base URL from the
 * Provider's configured baseUrl (DB record). Tests should either point
 * the Provider record at MOCK_BASE_URLS.* or add a server.use() override
 * keyed on the actual production URL.
 */
import { HttpResponse, http } from "msw";

export const MOCK_BASE_URLS = {
  openai: "https://api.openai.com",
  openrouter: "https://openrouter.ai",
  anthropic: "https://api.anthropic.com",
  siliconflow: "https://api.siliconflow.cn",
} as const;

const nowSeconds = () => Math.floor(Date.now() / 1000);

const openAiChatCompletion = (model = "mock-model", content = "mock-reply") => ({
  id: "chatcmpl-mock",
  object: "chat.completion",
  created: nowSeconds(),
  model,
  choices: [
    {
      index: 0,
      message: { role: "assistant", content },
      finish_reason: "stop",
    },
  ],
  usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
});

const openAiEmbedding = (model = "mock-embed", dim = 8) => ({
  object: "list",
  data: [
    {
      object: "embedding",
      index: 0,
      embedding: Array.from({ length: dim }, (_, i) => i / dim),
    },
  ],
  model,
  usage: { prompt_tokens: 5, total_tokens: 5 },
});

const anthropicMessage = (model = "claude-mock") => ({
  id: "msg_mock",
  type: "message",
  role: "assistant",
  model,
  stop_reason: "end_turn",
  stop_sequence: null,
  content: [{ type: "text", text: "mock-reply" }],
  usage: { input_tokens: 12, output_tokens: 8 },
});

export const handlers = [
  // OpenAI
  http.post(`${MOCK_BASE_URLS.openai}/v1/chat/completions`, async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as { model?: string };
    return HttpResponse.json(openAiChatCompletion(body.model));
  }),
  http.post(`${MOCK_BASE_URLS.openai}/v1/embeddings`, async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as { model?: string };
    return HttpResponse.json(openAiEmbedding(body.model));
  }),
  http.post(`${MOCK_BASE_URLS.openai}/v1/images/generations`, async () =>
    HttpResponse.json({
      created: nowSeconds(),
      data: [{ url: "https://example.com/mock-image.png" }],
    }),
  ),
  http.get(`${MOCK_BASE_URLS.openai}/v1/models`, async () =>
    HttpResponse.json({
      object: "list",
      data: [
        { id: "gpt-4o-mock", object: "model", owned_by: "mock" },
        { id: "text-embedding-3-small-mock", object: "model", owned_by: "mock" },
      ],
    }),
  ),

  // OpenRouter
  http.post(`${MOCK_BASE_URLS.openrouter}/api/v1/chat/completions`, async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as { model?: string };
    return HttpResponse.json(openAiChatCompletion(body.model));
  }),
  http.post(`${MOCK_BASE_URLS.openrouter}/api/v1/embeddings`, async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as { model?: string };
    return HttpResponse.json(openAiEmbedding(body.model));
  }),
  http.get(`${MOCK_BASE_URLS.openrouter}/api/v1/models`, async () =>
    HttpResponse.json({
      data: [{ id: "openai/gpt-4o-mock", name: "GPT-4o (mock)" }],
    }),
  ),
  http.get(`${MOCK_BASE_URLS.openrouter}/api/v1/activity`, async () =>
    HttpResponse.json({ data: [] }),
  ),

  // Anthropic
  http.post(`${MOCK_BASE_URLS.anthropic}/v1/messages`, async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as { model?: string };
    return HttpResponse.json(anthropicMessage(body.model));
  }),
  http.get(`${MOCK_BASE_URLS.anthropic}/v1/models`, async () =>
    HttpResponse.json({
      data: [{ id: "claude-sonnet-4-mock", display_name: "Claude Sonnet 4 (mock)" }],
    }),
  ),

  // SiliconFlow (OpenAI-compatible surface)
  http.post(`${MOCK_BASE_URLS.siliconflow}/v1/embeddings`, async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as { model?: string };
    return HttpResponse.json(openAiEmbedding(body.model));
  }),
  http.post(`${MOCK_BASE_URLS.siliconflow}/v1/chat/completions`, async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as { model?: string };
    return HttpResponse.json(openAiChatCompletion(body.model));
  }),
];
