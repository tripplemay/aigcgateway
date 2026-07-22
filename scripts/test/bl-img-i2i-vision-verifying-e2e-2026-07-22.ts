import { createHash } from "crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";

const prisma = new PrismaClient();
const BASE = process.env.BASE_URL ?? "http://localhost:3199";
const MOCK_PORT = Number(process.env.IIV_MOCK_PORT ?? 43219);
const MOCK_ROOT = `http://127.0.0.1:${MOCK_PORT}`;
const MOCK_API = `${MOCK_ROOT}/v1`;

const FULL_KEY = "pk_bl_iiv_l1_full_20260722";
const NO_IMAGE_KEY = "pk_bl_iiv_l1_no_image_20260722";
const NO_CHAT_KEY = "pk_bl_iiv_l1_no_chat_20260722";
const USER_ID = "bl_iiv_l1_user";
const PROJECT_ID = "bl_iiv_l1_project";
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const PNG_BYTES = Buffer.from(PNG_BASE64, "base64");
const IMAGE_URL = `${MOCK_ROOT}/source.png`;
const SMALL_DATA_URI = `data:image/png;base64,${PNG_BASE64}`;

type Json = Record<string, unknown>;
type CaseStatus = "PASS" | "FAIL";
interface CaseResult {
  id: string;
  title: string;
  status: CaseStatus;
  evidence: string;
}

const results: CaseResult[] = [];
const mockRequests: Array<{ path: string; body: Json }> = [];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function stableHash(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

function errorCode(body: any): string | undefined {
  return body?.error?.code;
}

function errorParam(body: any): string | undefined {
  return body?.error?.param;
}

async function runCase(id: string, title: string, fn: () => Promise<string> | string) {
  try {
    const evidence = await fn();
    results.push({ id, title, status: "PASS", evidence });
    console.log(`PASS ${id} ${title} :: ${evidence}`);
  } catch (error) {
    const evidence = (error as Error).message;
    results.push({ id, title, status: "FAIL", evidence });
    console.error(`FAIL ${id} ${title} :: ${evidence}`);
  }
}

async function jsonRequest(
  path: string,
  options: {
    method?: string;
    apiKey?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
) {
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (options.apiKey) headers.Authorization = `Bearer ${options.apiKey}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${BASE}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let body: any = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Keep raw response for diagnostics.
  }
  return { status: response.status, body, text, headers: response.headers };
}

async function multipartRequest(
  apiKey: string,
  fields: Record<string, string>,
  files: Array<{ name?: string; bytes: Uint8Array; type: string; field?: string }>,
  mask?: boolean,
) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    form.append(
      file.field ?? "image",
      new Blob([file.bytes], { type: file.type }),
      file.name ?? `source-${i}.png`,
    );
  }
  if (mask) form.append("mask", new Blob([PNG_BYTES], { type: "image/png" }), "mask.png");
  const response = await fetch(`${BASE}/v1/images/edits`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const text = await response.text();
  let body: any = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Keep raw response for diagnostics.
  }
  return { status: response.status, body, text, headers: response.headers };
}

function parseMcpResponse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    let lastData = "";
    for (const line of text.split("\n")) {
      if (line.startsWith("data: ")) lastData = line.slice(6);
    }
    return lastData ? JSON.parse(lastData) : text;
  }
}

async function mcpRequest(apiKey: string, method: string, params: Record<string, unknown> = {}) {
  const response = await fetch(`${BASE}/api/mcp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });
  const text = await response.text();
  return { status: response.status, body: parseMcpResponse(text), text };
}

async function mcpTool(apiKey: string, name: string, args: Record<string, unknown> = {}) {
  return mcpRequest(apiKey, "tools/call", { name, arguments: args });
}

function mcpResult(rpc: any): any {
  return rpc?.body?.result ?? rpc?.body;
}

function mcpText(rpc: any): string {
  const result = mcpResult(rpc);
  return String(result?.content?.[0]?.text ?? JSON.stringify(rpc?.body));
}

function mcpJson(rpc: any): any {
  return JSON.parse(mcpText(rpc));
}

async function upsertApiKey(rawKey: string, permissions: Record<string, boolean>) {
  const keyHash = stableHash(rawKey);
  await prisma.apiKey.upsert({
    where: { keyHash },
    update: {
      userId: USER_ID,
      status: "ACTIVE",
      permissions,
      rateLimit: 1000,
      ipWhitelist: undefined,
    },
    create: {
      userId: USER_ID,
      keyHash,
      keyPrefix: rawKey.slice(0, 8),
      name: `BL-IIV ${rawKey.slice(-8)}`,
      status: "ACTIVE",
      permissions,
      rateLimit: 1000,
    },
  });
}

async function upsertProvider(
  name: string,
  adapterType: "openai-compat" | "volcengine",
  quirks: string[],
) {
  const provider = await prisma.provider.upsert({
    where: { name },
    update: {
      displayName: name,
      baseUrl: MOCK_API,
      authType: "bearer",
      authConfig: { apiKey: "codex-l1-mock-key" },
      status: "ACTIVE",
      adapterType,
      proxyUrl: null,
    },
    create: {
      name,
      displayName: name,
      baseUrl: MOCK_API,
      authType: "bearer",
      authConfig: { apiKey: "codex-l1-mock-key" },
      status: "ACTIVE",
      adapterType,
    },
  });
  await prisma.providerConfig.upsert({
    where: { providerId: provider.id },
    update: {
      chatEndpoint: "/chat/completions",
      imageEndpoint: "/images/generations",
      imageViaChat: quirks.includes("image_via_chat_modalities"),
      supportsModelsApi: false,
      supportsSystemRole: true,
      quirks,
    },
    create: {
      providerId: provider.id,
      chatEndpoint: "/chat/completions",
      imageEndpoint: "/images/generations",
      imageViaChat: quirks.includes("image_via_chat_modalities"),
      supportsModelsApi: false,
      supportsSystemRole: true,
      quirks,
    },
  });
  return provider;
}

async function upsertRoutableModel(params: {
  alias: string;
  modelName: string;
  realModelId: string;
  modality: "TEXT" | "IMAGE";
  providerId: string;
  aliasCapabilities: Record<string, unknown> | null;
  modelCapabilities?: Record<string, unknown>;
  perCall?: boolean;
}) {
  const model = await prisma.model.upsert({
    where: { name: params.modelName },
    update: {
      displayName: params.modelName,
      modality: params.modality,
      enabled: true,
      capabilities: params.modelCapabilities ?? {},
      supportedSizes: params.modality === "IMAGE" ? ["1024x1024", "2048x2048"] : undefined,
    },
    create: {
      name: params.modelName,
      displayName: params.modelName,
      modality: params.modality,
      enabled: true,
      capabilities: params.modelCapabilities ?? {},
      supportedSizes: params.modality === "IMAGE" ? ["1024x1024", "2048x2048"] : undefined,
    },
  });
  const alias = await prisma.modelAlias.upsert({
    where: { alias: params.alias },
    update: {
      brand: "Codex L1",
      modality: params.modality,
      enabled: true,
      deprecated: false,
      capabilities: params.aliasCapabilities ?? undefined,
      sellPrice: params.perCall
        ? { unit: "call", perCall: 0.012, currency: "USD" }
        : { unit: "token", inputPer1M: 0.12, outputPer1M: 0.24, currency: "USD" },
    },
    create: {
      alias: params.alias,
      brand: "Codex L1",
      modality: params.modality,
      enabled: true,
      capabilities: params.aliasCapabilities ?? undefined,
      sellPrice: params.perCall
        ? { unit: "call", perCall: 0.012, currency: "USD" }
        : { unit: "token", inputPer1M: 0.12, outputPer1M: 0.24, currency: "USD" },
    },
  });
  await prisma.aliasModelLink.upsert({
    where: { aliasId_modelId: { aliasId: alias.id, modelId: model.id } },
    update: {},
    create: { aliasId: alias.id, modelId: model.id },
  });
  await prisma.channel.upsert({
    where: { providerId_modelId: { providerId: params.providerId, modelId: model.id } },
    update: {
      realModelId: params.realModelId,
      priority: 1,
      status: "ACTIVE",
      costPrice: params.perCall
        ? { unit: "call", perCall: 0.01, currency: "USD" }
        : { unit: "token", inputPer1M: 0.1, outputPer1M: 0.2, currency: "USD" },
      sellPrice: params.perCall
        ? { unit: "call", perCall: 0.012, currency: "USD" }
        : { unit: "token", inputPer1M: 0.12, outputPer1M: 0.24, currency: "USD" },
    },
    create: {
      providerId: params.providerId,
      modelId: model.id,
      realModelId: params.realModelId,
      priority: 1,
      status: "ACTIVE",
      costPrice: params.perCall
        ? { unit: "call", perCall: 0.01, currency: "USD" }
        : { unit: "token", inputPer1M: 0.1, outputPer1M: 0.2, currency: "USD" },
      sellPrice: params.perCall
        ? { unit: "call", perCall: 0.012, currency: "USD" }
        : { unit: "token", inputPer1M: 0.12, outputPer1M: 0.24, currency: "USD" },
    },
  });
}

async function setupFixtures() {
  await prisma.user.upsert({
    where: { id: USER_ID },
    update: {
      email: "bl-iiv-l1@test.local",
      passwordHash: "not-used-by-api-key-tests",
      name: "BL IIV L1",
      balance: 100,
      defaultProjectId: PROJECT_ID,
      suspended: false,
      deletedAt: null,
      rateLimit: { rpm: 1000, imageRpm: 1000, spendPerMin: 1000 },
    },
    create: {
      id: USER_ID,
      email: "bl-iiv-l1@test.local",
      passwordHash: "not-used-by-api-key-tests",
      name: "BL IIV L1",
      balance: 100,
      defaultProjectId: PROJECT_ID,
      rateLimit: { rpm: 1000, imageRpm: 1000, spendPerMin: 1000 },
    },
  });
  await prisma.project.upsert({
    where: { id: PROJECT_ID },
    update: {
      userId: USER_ID,
      name: "BL IIV L1 Project",
      rateLimit: { rpm: 1000, tpm: 1000000, imageRpm: 1000, spendPerMin: 1000 },
    },
    create: {
      id: PROJECT_ID,
      userId: USER_ID,
      name: "BL IIV L1 Project",
      rateLimit: { rpm: 1000, tpm: 1000000, imageRpm: 1000, spendPerMin: 1000 },
    },
  });
  await upsertApiKey(FULL_KEY, {
    chatCompletion: true,
    imageGeneration: true,
    logAccess: true,
    projectInfo: true,
  });
  await upsertApiKey(NO_IMAGE_KEY, {
    chatCompletion: true,
    imageGeneration: false,
    logAccess: true,
    projectInfo: true,
  });
  await upsertApiKey(NO_CHAT_KEY, {
    chatCompletion: false,
    imageGeneration: true,
    logAccess: true,
    projectInfo: true,
  });

  const volc = await upsertProvider("codex-iiv-volc-mock", "volcengine", []);
  const openRouter = await upsertProvider("codex-iiv-or-mock", "openai-compat", [
    "image_via_chat_modalities",
  ]);

  await upsertRoutableModel({
    alias: "seedream-4-5",
    modelName: "codex/seedream-4-5",
    realModelId: "ep-test-seedream-45",
    modality: "IMAGE",
    providerId: volc.id,
    aliasCapabilities: { text_to_image: true, preserved_marker: true },
    perCall: true,
  });
  await upsertRoutableModel({
    alias: "gpt-image",
    modelName: "codex/gpt-image",
    realModelId: "openai/gpt-5-image",
    modality: "IMAGE",
    providerId: openRouter.id,
    aliasCapabilities: { vision: true, preserved_marker: true },
  });
  await upsertRoutableModel({
    alias: "gemini-3-pro-image",
    modelName: "codex/gemini-3-pro-image",
    realModelId: "google/gemini-3-pro-image-preview",
    modality: "IMAGE",
    providerId: openRouter.id,
    aliasCapabilities: { vision: true, preserved_marker: true },
  });
  await upsertRoutableModel({
    alias: "codex-t2i-only",
    modelName: "codex/t2i-only",
    realModelId: "codex-t2i-only",
    modality: "IMAGE",
    providerId: volc.id,
    aliasCapabilities: { text_to_image: true },
    perCall: true,
  });
  await upsertRoutableModel({
    alias: "codex-text-no-vision",
    modelName: "codex/text-no-vision",
    realModelId: "codex-text-no-vision",
    modality: "TEXT",
    providerId: openRouter.id,
    aliasCapabilities: { streaming: true },
  });
  await upsertRoutableModel({
    alias: "codex-vision",
    modelName: "codex/vision",
    realModelId: "codex-vision",
    modality: "TEXT",
    providerId: openRouter.id,
    aliasCapabilities: { streaming: true, vision: true },
  });

  console.log(
    JSON.stringify(
      {
        fixture: "BL-IMG-I2I-VISION L1",
        userId: USER_ID,
        projectId: PROJECT_ID,
        mockApi: MOCK_API,
        aliases: [
          "seedream-4-5",
          "gpt-image",
          "gemini-3-pro-image",
          "codex-t2i-only",
          "codex-text-no-vision",
          "codex-vision",
        ],
      },
      null,
      2,
    ),
  );
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<Json> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? (JSON.parse(text) as Json) : {};
}

async function startMockServer() {
  const server = createServer(async (request, response) => {
    const path = request.url ?? "/";
    if (request.method === "GET" && (path === "/source.png" || path === "/generated.png")) {
      response.writeHead(200, { "Content-Type": "image/png", "Content-Length": PNG_BYTES.length });
      response.end(PNG_BYTES);
      return;
    }
    if (request.method !== "POST") {
      sendJson(response, 404, { error: { message: "not found" } });
      return;
    }
    let body: Json;
    try {
      body = await readJson(request);
    } catch {
      sendJson(response, 400, { error: { message: "invalid mock JSON" } });
      return;
    }
    mockRequests.push({ path, body });
    if (path.endsWith("/chat/completions")) {
      if (body.model === "ep-test-seedream-45" || body.model === "codex-t2i-only") {
        sendJson(response, 400, {
          error: { message: "mock chat unsupported; exercise volcengine image fallback" },
        });
        return;
      }
      if (
        body.model === "openai/gpt-5-image" ||
        body.model === "google/gemini-3-pro-image-preview"
      ) {
        sendJson(response, 200, {
          id: "mock-image-chat",
          created: Math.floor(Date.now() / 1000),
          model: body.model,
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: null,
                images: [{ type: "image_url", image_url: { url: `${MOCK_ROOT}/generated.png` } }],
              },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 17, completion_tokens: 9, total_tokens: 26 },
        });
        return;
      }
      sendJson(response, 200, {
        id: "mock-chat",
        created: Math.floor(Date.now() / 1000),
        model: body.model,
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: body.model === "codex-vision" ? "The image is a red square." : "OK",
            },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 },
      });
      return;
    }
    if (path.endsWith("/images/generations")) {
      sendJson(response, 200, {
        created: Math.floor(Date.now() / 1000),
        data: [{ url: `${MOCK_ROOT}/generated.png` }],
        usage: { generated_images: 1 },
      });
      return;
    }
    sendJson(response, 404, { error: { message: `unhandled mock path ${path}` } });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(MOCK_PORT, "127.0.0.1", () => resolve());
  });
  return server;
}

async function latestLog(modelName: string, source?: string) {
  return prisma.callLog.findFirst({
    where: { projectId: PROJECT_ID, modelName, ...(source ? { source } : {}) },
    orderBy: { createdAt: "desc" },
  });
}

async function runL1() {
  const server = await startMockServer();
  try {
    // Fixtures may be probed while the mock server is offline between --setup
    // and --run. Restore only this test's channels once the mock is listening.
    const testProviders = await prisma.provider.findMany({
      where: { name: { in: ["codex-iiv-volc-mock", "codex-iiv-or-mock"] } },
      select: { id: true },
    });
    await prisma.channel.updateMany({
      where: { providerId: { in: testProviders.map((provider) => provider.id) } },
      data: { status: "ACTIVE" },
    });
    const testChannels = await prisma.channel.findMany({
      where: { providerId: { in: testProviders.map((provider) => provider.id) } },
      select: { id: true },
    });
    await prisma.healthCheck.createMany({
      data: testChannels.map((channel) => ({
        channelId: channel.id,
        level: "API_REACHABILITY" as const,
        result: "PASS" as const,
        latencyMs: 1,
        responseBody: "BL-IIV local mock ready",
      })),
    });
    const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379/0");
    await redis.del(
      "models:list",
      "models:list:TEXT",
      "models:list:IMAGE",
      "models:list:VIDEO",
      "models:list:AUDIO",
    );
    await redis.quit();

    const hugeDataUri = `data:image/png;base64,${Buffer.alloc(5 * 1024 * 1024 + 1).toString("base64")}`;
    const elevenUrls = Array.from({ length: 11 }, (_, i) => `${MOCK_ROOT}/source.png?i=${i}`);

    await runCase("TC-IIV-013", "REST model list exposes provisioned capabilities", async () => {
      const response = await jsonRequest("/v1/models?modality=image", { apiKey: FULL_KEY });
      assert(response.status === 200, `expected 200, got ${response.status}: ${response.text}`);
      const models = response.body?.data as any[];
      for (const alias of ["seedream-4-5", "gpt-image", "gemini-3-pro-image"]) {
        const row = models.find((m) => m.id === alias);
        assert(row?.capabilities?.image_to_image === true, `${alias} missing image_to_image=true`);
      }
      const t2i = models.find((m) => m.id === "codex-t2i-only");
      assert(t2i?.capabilities?.image_to_image !== true, "non-target alias was mislabelled");
      return "three targets visible with i2i=true; non-target remains false";
    });

    await runCase("TC-IIV-020", "REST non-i2i capability gate", async () => {
      const before = mockRequests.length;
      const response = await jsonRequest("/v1/images/generations", {
        method: "POST",
        apiKey: FULL_KEY,
        body: { model: "codex-t2i-only", prompt: "edit", image: IMAGE_URL },
      });
      assert(response.status === 400, `expected 400, got ${response.status}: ${response.text}`);
      assert(errorCode(response.body) === "model_not_i2i_capable", response.text);
      assert(mockRequests.length === before, "provider was called despite capability gate");
      return "400 model_not_i2i_capable before provider call";
    });

    await runCase("TC-IIV-021", "REST rejects empty image array", async () => {
      const response = await jsonRequest("/v1/images/generations", {
        method: "POST",
        apiKey: FULL_KEY,
        body: { model: "seedream-4-5", prompt: "edit", image: [] },
      });
      assert(response.status === 400, `expected 400, got ${response.status}`);
      assert(errorCode(response.body) === "invalid_parameter", response.text);
      assert(errorParam(response.body) === "image", response.text);
      return response.text;
    });

    await runCase("TC-IIV-022", "REST rejects more than 10 images", async () => {
      const response = await jsonRequest("/v1/images/generations", {
        method: "POST",
        apiKey: FULL_KEY,
        body: { model: "seedream-4-5", prompt: "edit", image: elevenUrls },
      });
      assert(response.status === 400, `expected 400, got ${response.status}`);
      assert(errorParam(response.body) === "image", response.text);
      assert(response.text.includes("maximum is 10"), response.text);
      return response.text;
    });

    await runCase("TC-IIV-023", "REST rejects non-whitelisted protocol", async () => {
      const response = await jsonRequest("/v1/images/generations", {
        method: "POST",
        apiKey: FULL_KEY,
        body: { model: "seedream-4-5", prompt: "edit", image: "ftp://example.com/a.png" },
      });
      assert(response.status === 400, `expected 400, got ${response.status}`);
      assert(errorParam(response.body) === "image", response.text);
      assert(
        response.text.includes("not allowed") && response.text.includes("data:image"),
        response.text,
      );
      return response.text;
    });

    await runCase("TC-IIV-024", "REST rejects base64 over 5MB", async () => {
      const response = await jsonRequest("/v1/images/generations", {
        method: "POST",
        apiKey: FULL_KEY,
        body: { model: "seedream-4-5", prompt: "edit", image: hugeDataUri },
      });
      assert(response.status === 400, `expected 400, got ${response.status}`);
      assert(errorParam(response.body) === "image", response.text);
      assert(response.text.includes("5MB"), response.text);
      return `${response.status} ${errorCode(response.body)} ${errorParam(response.body)}`;
    });

    await runCase("TC-IIV-025", "REST locates invalid array item", async () => {
      const response = await jsonRequest("/v1/images/generations", {
        method: "POST",
        apiKey: FULL_KEY,
        body: { model: "seedream-4-5", prompt: "edit", image: [IMAGE_URL, ""] },
      });
      assert(response.status === 400, `expected 400, got ${response.status}`);
      assert(errorParam(response.body) === "image[1]", response.text);
      return response.text;
    });

    await runCase("TC-IIV-026", "REST validates required fields", async () => {
      for (const body of [
        { prompt: "x" },
        { model: "seedream-4-5" },
        { model: "seedream-4-5", prompt: "   " },
      ]) {
        const response = await jsonRequest("/v1/images/generations", {
          method: "POST",
          apiKey: FULL_KEY,
          body,
        });
        assert(response.status === 400, `expected 400, got ${response.status}: ${response.text}`);
      }
      return "missing model, missing prompt, blank prompt each returned 400";
    });

    await runCase("TC-IIV-047A", "generations enforces imageGeneration permission", async () => {
      const response = await jsonRequest("/v1/images/generations", {
        method: "POST",
        apiKey: NO_IMAGE_KEY,
        body: { model: "seedream-4-5", prompt: "edit", image: IMAGE_URL },
      });
      assert(response.status === 403, `expected 403, got ${response.status}: ${response.text}`);
      assert(errorCode(response.body) === "forbidden", response.text);
      return "403 forbidden";
    });

    await runCase("TC-IIV-030", "edits rejects non-multipart request", async () => {
      const response = await jsonRequest("/v1/images/edits", {
        method: "POST",
        apiKey: FULL_KEY,
        body: { model: "seedream-4-5", prompt: "edit" },
      });
      assert(response.status === 400, `expected 400, got ${response.status}`);
      assert(response.text.includes("multipart/form-data"), response.text);
      return response.text;
    });

    await runCase("TC-IIV-031", "edits requires an image file", async () => {
      const response = await multipartRequest(
        FULL_KEY,
        { model: "seedream-4-5", prompt: "edit" },
        [],
      );
      assert(response.status === 400, `expected 400, got ${response.status}`);
      assert(errorParam(response.body) === "image", response.text);
      return response.text;
    });

    await runCase("TC-IIV-032", "edits rejects mask explicitly", async () => {
      const response = await multipartRequest(
        FULL_KEY,
        { model: "seedream-4-5", prompt: "edit" },
        [{ bytes: PNG_BYTES, type: "image/png" }],
        true,
      );
      assert(response.status === 400, `expected 400, got ${response.status}`);
      assert(errorCode(response.body) === "mask_not_supported", response.text);
      assert(errorParam(response.body) === "mask", response.text);
      return response.text;
    });

    await runCase("TC-IIV-033", "edits rejects non-image MIME", async () => {
      const response = await multipartRequest(FULL_KEY, { model: "seedream-4-5", prompt: "edit" }, [
        { name: "bad.txt", bytes: Buffer.from("not an image"), type: "text/plain" },
      ]);
      assert(response.status === 400, `expected 400, got ${response.status}`);
      assert(errorParam(response.body) === "image", response.text);
      assert(response.text.includes("is not an image"), response.text);
      return response.text;
    });

    await runCase("TC-IIV-034", "edits rejects file over 5MB", async () => {
      const response = await multipartRequest(FULL_KEY, { model: "seedream-4-5", prompt: "edit" }, [
        { name: "large.png", bytes: Buffer.alloc(5 * 1024 * 1024 + 1), type: "image/png" },
      ]);
      assert(response.status === 400 || response.status === 413, `unexpected ${response.status}`);
      assert(response.text.includes("5MB"), response.text);
      return `${response.status} ${response.text}`;
    });

    await runCase("TC-IIV-035", "edits rejects more than 10 files", async () => {
      const response = await multipartRequest(
        FULL_KEY,
        { model: "seedream-4-5", prompt: "edit" },
        Array.from({ length: 11 }, (_, i) => ({
          name: `source-${i}.png`,
          bytes: PNG_BYTES,
          type: "image/png",
        })),
      );
      assert(response.status === 400, `expected 400, got ${response.status}`);
      assert(response.text.includes("maximum is 10"), response.text);
      return response.text;
    });

    await runCase("TC-IIV-047B", "edits enforces imageGeneration permission", async () => {
      const response = await multipartRequest(
        NO_IMAGE_KEY,
        { model: "seedream-4-5", prompt: "permission check" },
        [{ bytes: PNG_BYTES, type: "image/png" }],
      );
      assert(response.status === 403, `expected 403, got ${response.status}: ${response.text}`);
      assert(errorCode(response.body) === "forbidden", response.text);
      return "403 forbidden";
    });

    let seedreamUrlResponse: any;
    await runCase("TC-IIV-027A", "mock seedream URL i2i reaches volcengine fallback", async () => {
      const before = mockRequests.length;
      const response = await jsonRequest("/v1/images/generations", {
        method: "POST",
        apiKey: FULL_KEY,
        body: { model: "seedream-4-5", prompt: "preserve composition", image: IMAGE_URL },
      });
      seedreamUrlResponse = response;
      assert(response.status === 200, `expected 200, got ${response.status}: ${response.text}`);
      const sent = mockRequests.slice(before);
      const fallback = sent.find((r) => r.path.endsWith("/images/generations"));
      assert(Array.isArray(fallback?.body?.image), "volcengine fallback did not receive image[]");
      assert((fallback?.body?.image as unknown[])[0] === IMAGE_URL, "URL source image changed");
      return `200; upstream image=${JSON.stringify(fallback?.body?.image)}`;
    });

    await runCase(
      "TC-IIV-027B",
      "mock seedream base64 i2i reaches volcengine fallback",
      async () => {
        const before = mockRequests.length;
        const response = await jsonRequest("/v1/images/generations", {
          method: "POST",
          apiKey: FULL_KEY,
          body: { model: "seedream-4-5", prompt: "preserve color", image: SMALL_DATA_URI },
        });
        assert(response.status === 200, `expected 200, got ${response.status}: ${response.text}`);
        const fallback = mockRequests
          .slice(before)
          .find((r) => r.path.endsWith("/images/generations"));
        assert(
          Array.isArray(fallback?.body?.image) && fallback?.body?.image?.[0] === SMALL_DATA_URI,
          "base64 source image not forwarded unchanged",
        );
        return "200; exact data URI forwarded to mock upstream";
      },
    );

    await runCase("TC-IIV-027C", "mock OpenRouter i2i uses multimodal content", async () => {
      for (const model of ["gpt-image", "gemini-3-pro-image"]) {
        const before = mockRequests.length;
        const response = await jsonRequest("/v1/images/generations", {
          method: "POST",
          apiKey: FULL_KEY,
          body: { model, prompt: "transform", image: IMAGE_URL },
        });
        assert(
          response.status === 200,
          `${model}: expected 200, got ${response.status}: ${response.text}`,
        );
        const chat = mockRequests.slice(before).find((r) => r.path.endsWith("/chat/completions"));
        const messages = chat?.body?.messages as any[];
        const content = messages?.[0]?.content as any[];
        assert(Array.isArray(content), `${model}: content is not multimodal array`);
        assert(
          content.some((p) => p.type === "image_url" && p.image_url?.url === IMAGE_URL),
          `${model}: source image_url not forwarded`,
        );
      }
      return "gpt-image and gemini-3-pro-image forwarded standard image_url parts";
    });

    await runCase("TC-IIV-028", "REST signed proxy resolves mock output", async () => {
      const url = seedreamUrlResponse?.body?.data?.[0]?.url;
      assert(
        typeof url === "string" && url.includes("/v1/images/proxy/"),
        `not a proxy URL: ${url}`,
      );
      const response = await fetch(url);
      assert(response.status === 200, `proxy GET expected 200, got ${response.status}`);
      assert(response.headers.get("content-type")?.startsWith("image/"), "proxy is not image/*");
      return `GET ${url} -> 200 ${response.headers.get("content-type")}`;
    });

    await runCase("TC-IIV-036", "edits supports two source files and shared pipeline", async () => {
      const before = mockRequests.length;
      const response = await multipartRequest(
        FULL_KEY,
        { model: "seedream-4-5", prompt: "merge sources" },
        [
          { name: "a.png", bytes: PNG_BYTES, type: "image/png" },
          { name: "b.png", bytes: PNG_BYTES, type: "image/png" },
        ],
      );
      assert(response.status === 200, `expected 200, got ${response.status}: ${response.text}`);
      assert(Array.isArray(response.body?.data) && response.body.data.length === 1, response.text);
      const fallback = mockRequests
        .slice(before)
        .find((r) => r.path.endsWith("/images/generations"));
      assert(
        Array.isArray(fallback?.body?.image) && fallback?.body?.image?.length === 2,
        "not 2 images",
      );
      return "200; mock upstream received image[2]";
    });

    await runCase("TC-IIV-052", "i2i CallLog sanitizes URL and base64", async () => {
      const logs = await prisma.callLog.findMany({
        where: { projectId: PROJECT_ID, modelName: "seedream-4-5", status: "SUCCESS" },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
      assert(logs.length >= 3, `expected >=3 successful seedream logs, got ${logs.length}`);
      const serialized = logs.map((log) => JSON.stringify(log.requestParams));
      assert(
        serialized.some((s) => s.includes("[image:url 127.0.0.1:43219]")),
        "URL placeholder missing",
      );
      assert(
        serialized.some((s) => s.includes("[image:base64 ")),
        "base64 placeholder missing",
      );
      assert(
        serialized.every((s) => !s.includes(PNG_BASE64)),
        "raw source base64 leaked to requestParams",
      );
      return "requestParams contain URL/base64 placeholders and no raw source bytes";
    });

    await runCase("TC-IIV-053", "i2i CallLog records source image count", async () => {
      const logs = await prisma.callLog.findMany({
        where: { projectId: PROJECT_ID, modelName: "seedream-4-5", status: "SUCCESS" },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
      const counts = logs.map((log) => (log.responseSummary as any)?.source_images_count);
      assert(counts.includes(1), `missing source_images_count=1: ${JSON.stringify(counts)}`);
      assert(counts.includes(2), `missing source_images_count=2: ${JSON.stringify(counts)}`);
      return `observed source_images_count values: ${JSON.stringify(counts)}`;
    });

    await runCase("TC-IIV-054", "validation failure does not deduct balance", async () => {
      const before = await prisma.user.findUniqueOrThrow({
        where: { id: USER_ID },
        select: { balance: true },
      });
      const response = await jsonRequest("/v1/images/generations", {
        method: "POST",
        apiKey: FULL_KEY,
        body: { model: "seedream-4-5", prompt: "invalid", image: "ftp://bad/a.png" },
      });
      const after = await prisma.user.findUniqueOrThrow({
        where: { id: USER_ID },
        select: { balance: true },
      });
      assert(response.status === 400, `expected 400, got ${response.status}`);
      assert(
        before.balance.equals(after.balance),
        `balance changed ${before.balance} -> ${after.balance}`,
      );
      return `balance unchanged at ${after.balance.toString()}`;
    });

    await runCase("TC-IIV-046", "MCP tool schemas document multimodal inputs", async () => {
      const rpc = await mcpRequest(FULL_KEY, "tools/list");
      assert(rpc.status === 200, `HTTP ${rpc.status}: ${rpc.text}`);
      const tools = mcpResult(rpc)?.tools as any[];
      const chat = tools.find((tool) => tool.name === "chat");
      const generate = tools.find((tool) => tool.name === "generate_image");
      assert(chat?.inputSchema?.properties?.messages, "chat messages schema missing");
      assert(generate?.inputSchema?.properties?.image, "generate_image image schema missing");
      const descriptions = `${chat?.inputSchema?.properties?.messages?.description ?? ""} ${generate?.inputSchema?.properties?.image?.description ?? ""}`;
      assert(descriptions.includes("Prefer") && descriptions.includes("5MB"), descriptions);
      assert(descriptions.includes("image_to_image"), descriptions);
      return "chat/generate_image schemas expose URL guidance, limits and capability";
    });

    await runCase("TC-IIV-040", "MCP non-i2i capability gate", async () => {
      const rpc = await mcpTool(FULL_KEY, "generate_image", {
        model: "codex-t2i-only",
        prompt: "edit",
        image: IMAGE_URL,
      });
      const result = mcpResult(rpc);
      assert(result?.isError === true, `expected isError=true: ${rpc.text}`);
      assert(mcpText(rpc).includes("model_not_i2i_capable"), mcpText(rpc));
      return mcpText(rpc);
    });

    await runCase(
      "TC-IIV-041A",
      "MCP generate_image rejects invalid protocol cleanly",
      async () => {
        const rpc = await mcpTool(FULL_KEY, "generate_image", {
          model: "seedream-4-5",
          prompt: "edit",
          image: "ftp://bad/a.png",
        });
        const result = mcpResult(rpc);
        assert(result?.isError === true, `expected isError=true: ${rpc.text}`);
        const text = mcpText(rpc);
        assert(text.includes("invalid_parameter") && text.includes('"param":"image"'), text);
        return text;
      },
    );

    await runCase(
      "TC-IIV-041B",
      "MCP generate_image over-count uses coded tool envelope",
      async () => {
        const rpc = await mcpTool(FULL_KEY, "generate_image", {
          model: "seedream-4-5",
          prompt: "edit",
          image: elevenUrls,
        });
        const result = mcpResult(rpc);
        const text = mcpText(rpc);
        assert(result?.isError === true, `expected tool isError=true, got: ${rpc.text}`);
        assert(text.includes("invalid_parameter") && text.includes("image"), text);
        return text;
      },
    );

    await runCase("TC-IIV-043", "MCP chat non-vision capability gate", async () => {
      const rpc = await mcpTool(FULL_KEY, "chat", {
        model: "codex-text-no-vision",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "describe" },
              { type: "image_url", image_url: { url: IMAGE_URL } },
            ],
          },
        ],
      });
      assert(mcpResult(rpc)?.isError === true, `expected isError=true: ${rpc.text}`);
      assert(mcpText(rpc).includes("model_not_vision_capable"), mcpText(rpc));
      return mcpText(rpc);
    });

    await runCase("TC-IIV-044A", "MCP chat rejects invalid content part", async () => {
      const rpc = await mcpTool(FULL_KEY, "chat", {
        model: "codex-vision",
        messages: [{ role: "user", content: [{ type: "audio", url: "x" }] }],
      });
      assert(mcpResult(rpc)?.isError === true, `expected isError=true: ${rpc.text}`);
      assert(
        mcpText(rpc).includes("invalid_parameter") &&
          mcpText(rpc).includes("messages[0].content[0].type"),
        mcpText(rpc),
      );
      return mcpText(rpc);
    });

    await runCase("TC-IIV-044B", "MCP chat rejects more than 10 images", async () => {
      const rpc = await mcpTool(FULL_KEY, "chat", {
        model: "codex-vision",
        messages: [
          {
            role: "user",
            content: elevenUrls.map((url) => ({ type: "image_url", image_url: { url } })),
          },
        ],
      });
      assert(mcpResult(rpc)?.isError === true, `expected isError=true: ${rpc.text}`);
      const text = mcpText(rpc);
      assert(text.includes("invalid_parameter") && text.includes("maximum is 10"), text);
      return text;
    });

    await runCase("TC-IIV-044C", "MCP chat rejects base64 over 5MB", async () => {
      const rpc = await mcpTool(FULL_KEY, "chat", {
        model: "codex-vision",
        messages: [
          {
            role: "user",
            content: [{ type: "image_url", image_url: { url: hugeDataUri } }],
          },
        ],
      });
      assert(mcpResult(rpc)?.isError === true, `expected isError=true: ${rpc.text}`);
      assert(
        mcpText(rpc).includes("invalid_parameter") && mcpText(rpc).includes("5MB"),
        mcpText(rpc),
      );
      return "isError=true code=invalid_parameter limit=5MB";
    });

    await runCase("TC-IIV-042", "MCP generate_image mock i2i returns proxy URL", async () => {
      const rpc = await mcpTool(FULL_KEY, "generate_image", {
        model: "seedream-4-5",
        prompt: "edit via MCP",
        image: IMAGE_URL,
      });
      assert(!mcpResult(rpc)?.isError, `unexpected tool error: ${rpc.text}`);
      const body = mcpJson(rpc);
      assert(Array.isArray(body.images) && body.images.length === 1, JSON.stringify(body));
      assert(body.images[0].includes("/v1/images/proxy/"), JSON.stringify(body));
      return `trace=${body.traceId}; images=${body.images.length}`;
    });

    await runCase(
      "TC-IIV-045-MOCK",
      "MCP vision mock path accepts multimodal content",
      async () => {
        const before = mockRequests.length;
        const rpc = await mcpTool(FULL_KEY, "chat", {
          model: "codex-vision",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: "describe" },
                { type: "image_url", image_url: { url: IMAGE_URL } },
              ],
            },
          ],
          max_tokens: 20,
        });
        assert(!mcpResult(rpc)?.isError, `unexpected tool error: ${rpc.text}`);
        const body = mcpJson(rpc);
        assert(String(body.content).includes("red square"), JSON.stringify(body));
        const chat = mockRequests.slice(before).find((r) => r.path.endsWith("/chat/completions"));
        assert(
          Array.isArray((chat?.body?.messages as any[])?.[0]?.content),
          "upstream content not array",
        );
        return `mock answer=${JSON.stringify(body.content)}`;
      },
    );

    await runCase("TC-IIV-063", "MCP string chat regression", async () => {
      const rpc = await mcpTool(FULL_KEY, "chat", {
        model: "codex-text-no-vision",
        messages: [{ role: "user", content: "Say OK" }],
        max_tokens: 10,
      });
      assert(!mcpResult(rpc)?.isError, `unexpected tool error: ${rpc.text}`);
      const body = mcpJson(rpc);
      assert(body.content === "OK", JSON.stringify(body));
      return `content=${body.content}`;
    });

    await runCase("TC-IIV-060", "REST pure text-to-image regression", async () => {
      const before = mockRequests.length;
      const response = await jsonRequest("/v1/images/generations", {
        method: "POST",
        apiKey: FULL_KEY,
        body: { model: "seedream-4-5", prompt: "plain generation" },
      });
      assert(response.status === 200, `expected 200, got ${response.status}: ${response.text}`);
      const fallback = mockRequests
        .slice(before)
        .find((r) => r.path.endsWith("/images/generations"));
      assert(
        fallback && !("image" in fallback.body),
        `unexpected image in t2i body: ${JSON.stringify(fallback)}`,
      );
      return "200 and upstream t2i body has no image field";
    });

    await runCase("TC-IIV-061", "MCP pure text-to-image regression", async () => {
      const rpc = await mcpTool(FULL_KEY, "generate_image", {
        model: "seedream-4-5",
        prompt: "plain MCP generation",
      });
      assert(!mcpResult(rpc)?.isError, `unexpected tool error: ${rpc.text}`);
      const body = mcpJson(rpc);
      assert(body.count === 1, JSON.stringify(body));
      return `trace=${body.traceId}; count=${body.count}`;
    });

    await runCase("TC-IIV-062", "REST string chat regression", async () => {
      const response = await jsonRequest("/v1/chat/completions", {
        method: "POST",
        apiKey: FULL_KEY,
        body: {
          model: "codex-text-no-vision",
          messages: [{ role: "user", content: "Say OK" }],
          max_tokens: 10,
        },
      });
      assert(response.status === 200, `expected 200, got ${response.status}: ${response.text}`);
      assert(response.body?.choices?.[0]?.message?.content === "OK", response.text);
      return "200 content=OK";
    });

    await runCase("TC-IIV-065A", "REST vision multimodal regression", async () => {
      const response = await jsonRequest("/v1/chat/completions", {
        method: "POST",
        apiKey: FULL_KEY,
        body: {
          model: "codex-vision",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: "describe" },
                { type: "image_url", image_url: { url: IMAGE_URL } },
              ],
            },
          ],
        },
      });
      assert(response.status === 200, `expected 200, got ${response.status}: ${response.text}`);
      assert(response.body?.choices?.[0]?.message?.content?.includes("red square"), response.text);
      return "200 mock vision answer preserved";
    });

    await runCase("TC-IIV-065B", "REST non-vision gate regression", async () => {
      const response = await jsonRequest("/v1/chat/completions", {
        method: "POST",
        apiKey: FULL_KEY,
        body: {
          model: "codex-text-no-vision",
          messages: [
            {
              role: "user",
              content: [{ type: "image_url", image_url: { url: IMAGE_URL } }],
            },
          ],
        },
      });
      assert(response.status === 400, `expected 400, got ${response.status}: ${response.text}`);
      assert(errorCode(response.body) === "model_not_vision_capable", response.text);
      return response.text;
    });

    await runCase("TC-IIV-066", "invalid model errors remain clean", async () => {
      await new Promise((resolve) => setTimeout(resolve, 5500));
      const rest = await jsonRequest("/v1/images/generations", {
        method: "POST",
        apiKey: FULL_KEY,
        body: { model: "does-not-exist", prompt: "x" },
      });
      assert(rest.status === 404 && errorCode(rest.body) === "model_not_found", rest.text);
      const mcp = await mcpTool(FULL_KEY, "generate_image", {
        model: "does-not-exist",
        prompt: "x",
      });
      assert(mcpResult(mcp)?.isError === true, mcp.text);
      assert(mcpText(mcp).includes("model_not_found"), mcpText(mcp));
      return "REST 404 model_not_found; MCP isError model_not_found";
    });

    await runCase("TC-IIV-047C", "MCP authentication and permissions remain enforced", async () => {
      const unauth = await mcpRequest("pk_invalid", "tools/list");
      assert(unauth.status === 401, `invalid key expected 401, got ${unauth.status}`);
      const noImage = await mcpTool(NO_IMAGE_KEY, "generate_image", {
        model: "seedream-4-5",
        prompt: "x",
      });
      assert(mcpResult(noImage)?.isError === true, noImage.text);
      assert(mcpText(noImage).includes("lacks imageGeneration permission"), mcpText(noImage));
      const noChat = await mcpTool(NO_CHAT_KEY, "chat", {
        model: "codex-text-no-vision",
        messages: [{ role: "user", content: "x" }],
      });
      assert(mcpResult(noChat)?.isError === true, noChat.text);
      assert(mcpText(noChat).includes("lacks chatCompletion permission"), mcpText(noChat));
      return "invalid key 401; image/chat permission denials returned isError";
    });

    await runCase("TC-IIV-052-MCP", "MCP vision log sanitizes image URL", async () => {
      const log = await latestLog("codex-vision", "mcp");
      assert(log, "missing MCP vision CallLog");
      const snapshot = JSON.stringify(log.promptSnapshot);
      assert(snapshot.includes("[image:url 127.0.0.1:43219]"), snapshot);
      assert(!snapshot.includes(IMAGE_URL), snapshot);
      return "MCP promptSnapshot contains URL placeholder only";
    });

    await runCase("TC-IIV-067", "MCP read tools remain available", async () => {
      const balanceRpc = await mcpTool(FULL_KEY, "get_balance", {});
      assert(!mcpResult(balanceRpc)?.isError, balanceRpc.text);
      const logsRpc = await mcpTool(FULL_KEY, "list_logs", { limit: 3 });
      assert(!mcpResult(logsRpc)?.isError, logsRpc.text);
      const modelsRpc = await mcpTool(FULL_KEY, "list_models", { modality: "image" });
      assert(!mcpResult(modelsRpc)?.isError, modelsRpc.text);
      const models = mcpJson(modelsRpc)?.models ?? mcpJson(modelsRpc);
      assert(Array.isArray(models), JSON.stringify(models));
      return "get_balance, list_logs and list_models all succeeded";
    });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  const pass = results.filter((result) => result.status === "PASS").length;
  const fail = results.filter((result) => result.status === "FAIL").length;
  console.log(`\nSUMMARY pass=${pass} fail=${fail} total=${results.length}`);
  console.log(JSON.stringify({ pass, fail, total: results.length, results }, null, 2));
  if (fail > 0) process.exitCode = 1;
}

async function main() {
  if (process.argv.includes("--setup")) {
    await setupFixtures();
    return;
  }
  if (process.argv.includes("--run")) {
    await runL1();
    return;
  }
  throw new Error(
    "Usage: npx tsx scripts/test/bl-img-i2i-vision-verifying-e2e-2026-07-22.ts --setup|--run",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
