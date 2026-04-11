/**
 * Mock Provider Server — 公共库
 *
 * 提供 startMockProvider() 启动一个模拟 OpenAI 兼容 API 的 HTTP 服务，
 * 支持 chat completions（含 streaming）和 image generations。
 *
 * Usage:
 *   import { startMockProvider } from "../../tests/mocks/provider-server";
 *   const mock = await startMockProvider({ port: 3312 });
 *   // ... run tests against mock.baseUrl ...
 *   await mock.close();
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "http";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MockProviderOptions {
  /** Port to listen on (default: 0 = random available port) */
  port?: number;
  /** Custom request handler — return true if handled, false to fall through to defaults */
  onRequest?: (
    req: IncomingMessage,
    res: ServerResponse,
    body: string,
  ) => boolean | Promise<boolean>;
}

export interface MockProviderHandle {
  /** Base URL including port, e.g. "http://127.0.0.1:3312" */
  baseUrl: string;
  /** The actual port the server is listening on */
  port: number;
  /** Underlying http.Server */
  server: Server;
  /** Gracefully close the server */
  close: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers (exported for reuse in custom handlers)
// ---------------------------------------------------------------------------

export function jsonResponse(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

export async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

// ---------------------------------------------------------------------------
// Default response builders
// ---------------------------------------------------------------------------

function buildChatCompletion(body: Record<string, unknown>) {
  const messages = (body.messages ?? []) as Array<{ role: string; content: string }>;
  const lastUser = [...messages].reverse().find((m) => m?.role === "user");
  const prompt = String(lastUser?.content ?? "");
  const model = String(body.model ?? "mock-model");
  const created = Math.floor(Date.now() / 1000);
  const content = `mock-reply: ${prompt.slice(0, 80)}`;
  const usage = { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 };

  return { model, created, content, usage };
}

function handleChatCompletionsNonStream(res: ServerResponse, body: Record<string, unknown>): void {
  const { model, created, content, usage } = buildChatCompletion(body);
  jsonResponse(res, 200, {
    id: "chatcmpl-mock",
    object: "chat.completion",
    created,
    model,
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    usage,
  });
}

function handleChatCompletionsStream(res: ServerResponse, body: Record<string, unknown>): void {
  const { model, created, content, usage } = buildChatCompletion(body);

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  // Split content into two chunks
  const mid = Math.ceil(content.length / 2);
  const pieces = [content.slice(0, mid), content.slice(mid)].filter(Boolean);

  for (const piece of pieces) {
    const chunk = {
      id: "chatcmpl-mock",
      object: "chat.completion.chunk",
      created,
      model,
      choices: [{ index: 0, delta: { content: piece }, finish_reason: null }],
    };
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  }

  const finalChunk = {
    id: "chatcmpl-mock",
    object: "chat.completion.chunk",
    created,
    model,
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
    usage,
  };
  res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
  res.write("data: [DONE]\n\n");
  res.end();
}

function handleImageGenerations(res: ServerResponse): void {
  jsonResponse(res, 200, {
    created: Math.floor(Date.now() / 1000),
    data: [{ url: "https://example.com/mock-image.png" }],
  });
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export async function startMockProvider(
  options: MockProviderOptions = {},
): Promise<MockProviderHandle> {
  const { port = 0, onRequest } = options;

  const server = createServer(async (req, res) => {
    const body = req.method === "GET" ? "" : await readBody(req);

    // Custom handler gets first crack
    if (onRequest) {
      const handled = await onRequest(req, res, body);
      if (handled) return;
    }

    // Default: chat completions
    if (req.method === "POST" && req.url === "/v1/chat/completions") {
      const parsed = JSON.parse(body || "{}");
      if (parsed.stream) {
        handleChatCompletionsStream(res, parsed);
      } else {
        handleChatCompletionsNonStream(res, parsed);
      }
      return;
    }

    // Default: image generations
    if (req.method === "POST" && req.url === "/v1/images/generations") {
      handleImageGenerations(res);
      return;
    }

    // Default: models list
    if (req.method === "GET" && req.url === "/v1/models") {
      jsonResponse(res, 200, {
        object: "list",
        data: [
          { id: "mock-chat-model", object: "model", owned_by: "mock" },
          { id: "mock-image-model", object: "model", owned_by: "mock" },
        ],
      });
      return;
    }

    jsonResponse(res, 404, { error: "not_found" });
  });

  // Prevent idle connection timeouts that cause "fetch failed" in long-running tests
  server.keepAliveTimeout = 120_000;
  server.headersTimeout = 120_000;

  const actualPort = await new Promise<number>((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const addr = server.address();
      resolve(typeof addr === "object" && addr ? addr.port : port);
    });
  });

  const baseUrl = `http://127.0.0.1:${actualPort}`;

  return {
    baseUrl,
    port: actualPort,
    server,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
