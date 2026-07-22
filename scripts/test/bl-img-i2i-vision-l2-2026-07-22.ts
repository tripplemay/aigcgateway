import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";

const prisma = new PrismaClient();
const BASE = process.env.BASE_URL ?? "http://localhost:3199";
const API_KEY = "pk_bl_iiv_l1_full_20260722";
const USER_ID = "bl_iiv_l1_user";
const PROJECT_ID = "bl_iiv_l1_project";
const SOURCE_URL = process.env.IIV_SOURCE_URL ?? "https://picsum.photos/id/237/512/512.jpg";
const IMAGE_COST = "0.0274";
const IMAGE_SELL = "0.03288";
const FETCH_TIMEOUT_MS = 240_000;
const CASE_FILTER = new Set(
  (process.env.IIV_CASES ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);

type Status = "PASS" | "FAIL" | "BLOCKED";
interface Result {
  id: string;
  title: string;
  status: Status;
  evidence: string;
}

const results: Result[] = [];

class BlockedError extends Error {}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function requiredSecret(name: string): string {
  const value = process.env[name];
  if (!value || value.length < 8) throw new Error(`Missing required secret: ${name}`);
  return value;
}

function stableHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function fetchWithTimeout(input: string, init?: RequestInit): Promise<Response> {
  return fetch(input, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
}

async function responseBody(response: Response): Promise<{ text: string; json: any }> {
  const text = await response.text();
  try {
    return { text, json: text ? JSON.parse(text) : null };
  } catch {
    return { text, json: null };
  }
}

async function jsonRequest(path: string, body: unknown) {
  const response = await fetchWithTimeout(`${BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { response, ...(await responseBody(response)) };
}

async function multipartRequest(
  prompt: string,
  files: Array<{ body: Uint8Array; type: string; name: string }>,
) {
  const form = new FormData();
  form.append("model", "seedream-4-5");
  form.append("prompt", prompt);
  for (const file of files) {
    form.append("image", new Blob([file.body], { type: file.type }), file.name);
  }
  const response = await fetchWithTimeout(`${BASE}/v1/images/edits`, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}` },
    body: form,
  });
  return { response, ...(await responseBody(response)) };
}

function parseMcpResponse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    let lastData = "";
    for (const line of text.split("\n")) {
      if (line.startsWith("data: ")) lastData = line.slice(6);
    }
    return lastData ? JSON.parse(lastData) : null;
  }
}

async function mcpTool(name: string, args: Record<string, unknown>) {
  const response = await fetchWithTimeout(`${BASE}/api/mcp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  const text = await response.text();
  const rpc = parseMcpResponse(text);
  const result = rpc?.result ?? rpc;
  const contentText = String(result?.content?.[0]?.text ?? "");
  let contentJson: any = null;
  try {
    contentJson = contentText ? JSON.parse(contentText) : null;
  } catch {
    // Error envelopes intentionally remain plain text.
  }
  return { response, text, result, contentText, contentJson };
}

async function runCase(id: string, title: string, test: () => Promise<string>) {
  if (CASE_FILTER.size > 0 && !CASE_FILTER.has(id)) return;
  const started = Date.now();
  try {
    const evidence = await test();
    results.push({ id, title, status: "PASS", evidence });
    console.log(`PASS ${id} ${title} (${Date.now() - started}ms) :: ${evidence}`);
  } catch (error) {
    const status: Status = error instanceof BlockedError ? "BLOCKED" : "FAIL";
    const evidence = (error as Error).message;
    results.push({ id, title, status, evidence });
    console.log(`${status} ${id} ${title} (${Date.now() - started}ms) :: ${evidence}`);
  }
}

async function userBalance() {
  return (
    await prisma.user.findUniqueOrThrow({ where: { id: USER_ID }, select: { balance: true } })
  ).balance;
}

function traceFromProxyUrl(url: string): string {
  const match = new URL(url, BASE).pathname.match(/\/v1\/images\/proxy\/([^/]+)\/\d+$/);
  assert(match?.[1], `Proxy URL has no trace ID: ${url}`);
  return decodeURIComponent(match[1]);
}

async function assertProxyAndPersisted(url: string, label: string): Promise<string> {
  assert(url.includes("/v1/images/proxy/"), `Not a signed proxy URL: ${url}`);
  // MCP has no Request object, so local builds use SITE_URL from .env and may
  // emit the production origin. The signature covers path params only; route
  // the same signed path/query through the isolated localhost instance.
  const advertisedUrl = new URL(url, BASE);
  const localBase = new URL(BASE);
  advertisedUrl.protocol = localBase.protocol;
  advertisedUrl.host = localBase.host;
  const response = await fetchWithTimeout(advertisedUrl.toString());
  const contentType = response.headers.get("content-type") ?? "";
  const body = Buffer.from(await response.arrayBuffer());
  assert(response.status === 200, `Proxy GET returned ${response.status}`);
  assert(contentType.startsWith("image/"), `Proxy content type is ${contentType}`);
  assert(body.length > 100, `Proxy image is unexpectedly small (${body.length} bytes)`);

  const traceId = traceFromProxyUrl(url);
  const log = await prisma.callLog.findUniqueOrThrow({ where: { traceId } });
  const summary = (log.responseSummary ?? {}) as Record<string, unknown>;
  const originalUrls = Array.isArray(summary.original_urls) ? summary.original_urls : [];
  const objectKey = originalUrls[0];
  assert(
    typeof objectKey === "string" && objectKey.startsWith(`images/${PROJECT_ID}/${traceId}/0.`),
    `Expected persisted GCS object key, got ${JSON.stringify(objectKey)}`,
  );

  const extension = contentType.includes("jpeg")
    ? "jpg"
    : contentType.includes("webp")
      ? "webp"
      : "png";
  const outputPath = `/tmp/bl-img-i2i-vision-l2-${label}.${extension}`;
  await writeFile(outputPath, body);
  return `${traceId}; proxy=200 ${contentType} ${body.length}B; GCS=${objectKey}; file=${outputPath}`;
}

async function assertImageBilling(
  traceId: string,
  sourceCount: number | undefined,
  marker: string,
) {
  const log = await prisma.callLog.findUniqueOrThrow({ where: { traceId } });
  assert(log.status === "SUCCESS", `CallLog status is ${log.status}`);
  assert(log.costPrice?.equals(IMAGE_COST), `costPrice=${log.costPrice?.toString()}`);
  assert(log.sellPrice?.equals(IMAGE_SELL), `sellPrice=${log.sellPrice?.toString()}`);

  const summary = (log.responseSummary ?? {}) as Record<string, unknown>;
  if (sourceCount === undefined) {
    assert(
      summary.source_images_count === undefined,
      `source_images_count=${summary.source_images_count}`,
    );
  } else {
    assert(
      summary.source_images_count === sourceCount,
      `source_images_count=${summary.source_images_count}`,
    );
  }
  const sanitized = JSON.stringify({ prompt: log.promptSnapshot, params: log.requestParams });
  assert(sanitized.includes(marker), `Missing sanitized marker ${marker}: ${sanitized}`);
  assert(!sanitized.includes("data:image/"), "Raw source data URI leaked into CallLog");

  const transaction = await prisma.transaction.findFirst({
    where: { traceId, type: "DEDUCTION", status: "COMPLETED" },
    orderBy: { createdAt: "desc" },
  });
  assert(
    transaction?.amount.equals(`-${IMAGE_SELL}`),
    `transaction=${transaction?.amount.toString()}`,
  );
}

async function runBilledImageCall(
  label: string,
  sourceCount: number | undefined,
  marker: string,
  invoke: () => Promise<{ status: number; body: any; text: string }>,
) {
  const before = await userBalance();
  const result = await invoke();
  assert(result.status === 200, `HTTP ${result.status}: ${result.text.slice(0, 800)}`);
  const url = result.body?.data?.[0]?.url;
  assert(typeof url === "string", `Missing data[0].url: ${result.text.slice(0, 800)}`);
  const proxyEvidence = await assertProxyAndPersisted(url, label);
  const traceId = traceFromProxyUrl(url);
  await assertImageBilling(traceId, sourceCount, marker);
  const after = await userBalance();
  assert(before.minus(after).equals(IMAGE_SELL), `balance delta=${before.minus(after).toString()}`);
  return `${proxyEvidence}; balance_delta=${before.minus(after).toString()}`;
}

async function setupRealProviders() {
  const volcengineKey = requiredSecret("VOLCENGINE_API_KEY");
  const openRouterKey = requiredSecret("OPENROUTER_API_KEY");
  const qwenKey = requiredSecret("QWEN_API_KEY");

  const volc = await prisma.provider.findUniqueOrThrow({ where: { name: "codex-iiv-volc-mock" } });
  const openRouter = await prisma.provider.findUniqueOrThrow({
    where: { name: "codex-iiv-or-mock" },
  });
  await prisma.provider.update({
    where: { id: volc.id },
    data: {
      displayName: "Codex IIV Volcengine L2",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      authConfig: { apiKey: volcengineKey },
      status: "ACTIVE",
      adapterType: "volcengine",
      proxyUrl: null,
    },
  });
  await prisma.providerConfig.update({
    where: { providerId: volc.id },
    data: {
      chatEndpoint: "/chat/completions",
      imageEndpoint: "/images/generations",
      imageViaChat: true,
      supportsModelsApi: false,
      quirks: {
        flags: [
          "image_prefer_chat",
          "model_can_be_endpoint_id",
          "multi_size_retry",
          "no_charge_on_image_failure",
        ],
      },
    },
  });
  await prisma.provider.update({
    where: { id: openRouter.id },
    data: {
      displayName: "Codex IIV OpenRouter L2",
      baseUrl: "https://openrouter.ai/api/v1",
      authConfig: { apiKey: openRouterKey },
      status: "ACTIVE",
      adapterType: "openai-compat",
      proxyUrl: null,
    },
  });
  await prisma.providerConfig.update({
    where: { providerId: openRouter.id },
    data: {
      chatEndpoint: "/chat/completions",
      imageEndpoint: "/images/generations",
      imageViaChat: true,
      supportsModelsApi: false,
      quirks: ["image_via_chat_modalities"],
    },
  });

  const qwen = await prisma.provider.upsert({
    where: { name: "codex-iiv-qwen-real" },
    update: {
      displayName: "Codex IIV Qwen L2",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      authConfig: { apiKey: qwenKey },
      status: "ACTIVE",
      adapterType: "openai-compat",
      proxyUrl: null,
    },
    create: {
      name: "codex-iiv-qwen-real",
      displayName: "Codex IIV Qwen L2",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      authType: "bearer",
      authConfig: { apiKey: qwenKey },
      status: "ACTIVE",
      adapterType: "openai-compat",
    },
  });
  await prisma.providerConfig.upsert({
    where: { providerId: qwen.id },
    update: {
      chatEndpoint: "/chat/completions",
      imageEndpoint: "/images/generations",
      imageViaChat: false,
      supportsModelsApi: false,
      supportsSystemRole: true,
      quirks: [],
    },
    create: {
      providerId: qwen.id,
      chatEndpoint: "/chat/completions",
      imageEndpoint: "/images/generations",
      imageViaChat: false,
      supportsModelsApi: false,
      supportsSystemRole: true,
      quirks: [],
    },
  });

  const seedream = await prisma.model.findUniqueOrThrow({ where: { name: "codex/seedream-4-5" } });
  const gptImage = await prisma.model.findUniqueOrThrow({ where: { name: "codex/gpt-image" } });
  const geminiImage = await prisma.model.findUniqueOrThrow({
    where: { name: "codex/gemini-3-pro-image" },
  });
  const vision = await prisma.model.findUniqueOrThrow({ where: { name: "codex/vision" } });

  await prisma.channel.update({
    where: { providerId_modelId: { providerId: volc.id, modelId: seedream.id } },
    data: {
      realModelId: "ep-20260604162024-k2sbk",
      status: "ACTIVE",
      costPrice: { unit: "call", perCall: Number(IMAGE_COST), currency: "USD" },
      sellPrice: { unit: "call", perCall: Number(IMAGE_SELL), currency: "USD" },
    },
  });
  await prisma.modelAlias.update({
    where: { alias: "seedream-4-5" },
    data: { sellPrice: { unit: "call", perCall: Number(IMAGE_SELL), currency: "USD" } },
  });
  await prisma.channel.update({
    where: { providerId_modelId: { providerId: openRouter.id, modelId: gptImage.id } },
    data: { realModelId: "openai/gpt-5-image", status: "ACTIVE" },
  });
  await prisma.channel.update({
    where: { providerId_modelId: { providerId: openRouter.id, modelId: geminiImage.id } },
    data: { realModelId: "google/gemini-3-pro-image-preview", status: "ACTIVE" },
  });

  const oldVisionChannel = await prisma.channel.findUniqueOrThrow({
    where: { providerId_modelId: { providerId: openRouter.id, modelId: vision.id } },
  });
  await prisma.channel.update({
    where: { id: oldVisionChannel.id },
    data: {
      providerId: qwen.id,
      realModelId: "qwen-vl-max",
      status: "ACTIVE",
      costPrice: { unit: "token", inputPer1M: 0.8, outputPer1M: 3.2, currency: "USD" },
      sellPrice: { unit: "token", inputPer1M: 0.96, outputPer1M: 3.84, currency: "USD" },
    },
  });
  await prisma.modelAlias.update({
    where: { alias: "codex-vision" },
    data: {
      sellPrice: { unit: "token", inputPer1M: 0.96, outputPer1M: 3.84, currency: "USD" },
    },
  });

  const testProviderIds = [volc.id, openRouter.id, qwen.id];
  await prisma.channel.updateMany({
    where: { providerId: { in: testProviderIds } },
    data: { status: "ACTIVE" },
  });
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379/0");
  await redis.del("models:list", "models:list:TEXT", "models:list:IMAGE");
  await redis.quit();

  console.log(
    JSON.stringify({
      fixture: "BL-IMG-I2I-VISION L2",
      providers: ["volcengine", "openrouter", "qwen"],
      keysLoaded: { volcengine: true, openrouter: true, qwen: true },
      projectId: PROJECT_ID,
    }),
  );
}

async function prepareRun() {
  const providerNames = ["codex-iiv-volc-mock", "codex-iiv-or-mock", "codex-iiv-qwen-real"];
  const providers = await prisma.provider.findMany({
    where: { name: { in: providerNames } },
    select: { id: true },
  });
  await prisma.channel.updateMany({
    where: { providerId: { in: providers.map((provider) => provider.id) } },
    data: { status: "ACTIVE" },
  });
  const channels = await prisma.channel.findMany({
    where: { providerId: { in: providers.map((provider) => provider.id) } },
    select: { id: true },
  });
  await prisma.healthCheck.createMany({
    data: channels.map((channel) => ({
      channelId: channel.id,
      level: "API_REACHABILITY" as const,
      result: "PASS" as const,
      latencyMs: 1,
      responseBody: "BL-IIV L2 authorized fixture",
    })),
  });
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379/0");
  await redis.del("models:list", "models:list:TEXT", "models:list:IMAGE");
  await redis.quit();
}

async function runL2() {
  await prepareRun();
  const sourceResponse = await fetchWithTimeout(SOURCE_URL);
  const sourceType = sourceResponse.headers.get("content-type")?.split(";")[0] ?? "";
  const sourceBytes = Buffer.from(await sourceResponse.arrayBuffer());
  assert(sourceResponse.ok, `Source image HTTP ${sourceResponse.status}`);
  assert(sourceType.startsWith("image/"), `Source content type is ${sourceType}`);
  assert(sourceBytes.length > 100 && sourceBytes.length < 5 * 1024 * 1024, "Source size invalid");
  const sourceDataUri = `data:${sourceType};base64,${sourceBytes.toString("base64")}`;

  await runCase("TC-IIV-027-URL", "seedream URL i2i + GCS + perCall billing", async () =>
    runBilledImageCall("seedream-url", 1, "[image:url picsum.photos]", async () => {
      const result = await jsonRequest("/v1/images/generations", {
        model: "seedream-4-5",
        prompt: "Turn the dog photo into a watercolor painting while preserving the dog and pose.",
        image: SOURCE_URL,
      });
      return { status: result.response.status, body: result.json, text: result.text };
    }),
  );

  await runCase("TC-IIV-027-B64", "seedream base64 i2i + log sanitization", async () =>
    runBilledImageCall("seedream-base64", 1, `[image:base64 ${sourceBytes.length}B]`, async () => {
      const result = await jsonRequest("/v1/images/generations", {
        model: "seedream-4-5",
        prompt: "Render the source dog as a clean ink illustration while preserving composition.",
        image: sourceDataUri,
      });
      return { status: result.response.status, body: result.json, text: result.text };
    }),
  );

  await runCase("TC-IIV-036-ONE", "edits one-file real i2i", async () =>
    runBilledImageCall("edits-one", 1, `[image:base64 ${sourceBytes.length}B]`, async () => {
      const result = await multipartRequest("Convert the dog into a paper-cut illustration.", [
        { body: sourceBytes, type: sourceType, name: "dog.jpg" },
      ]);
      return { status: result.response.status, body: result.json, text: result.text };
    }),
  );

  await runCase("TC-IIV-036-TWO", "edits two-file real multi-image i2i", async () =>
    runBilledImageCall("edits-two", 2, `[image:base64 ${sourceBytes.length}B]`, async () => {
      const result = await multipartRequest(
        "Create one coherent watercolor scene from both dog references.",
        [
          { body: sourceBytes, type: sourceType, name: "dog-a.jpg" },
          { body: sourceBytes, type: sourceType, name: "dog-b.jpg" },
        ],
      );
      return { status: result.response.status, body: result.json, text: result.text };
    }),
  );

  await runCase("TC-IIV-042", "MCP generate_image real URL i2i", async () => {
    const before = await userBalance();
    const rpc = await mcpTool("generate_image", {
      model: "seedream-4-5",
      prompt: "Transform the dog into a soft pastel drawing while preserving the animal.",
      image: SOURCE_URL,
    });
    assert(!rpc.result?.isError, rpc.contentText || rpc.text);
    const url = rpc.contentJson?.images?.[0];
    const traceId = rpc.contentJson?.traceId;
    assert(typeof url === "string" && typeof traceId === "string", rpc.contentText);
    const proxyEvidence = await assertProxyAndPersisted(url, "mcp-seedream-url");
    await assertImageBilling(traceId, 1, "[image:url picsum.photos]");
    const after = await userBalance();
    assert(
      before.minus(after).equals(IMAGE_SELL),
      `balance delta=${before.minus(after).toString()}`,
    );
    return `${proxyEvidence}; balance_delta=${before.minus(after).toString()}`;
  });

  await runCase("TC-IIV-045-MCP", "MCP chat real vision description", async () => {
    const rpc = await mcpTool("chat", {
      model: "codex-vision",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Name the main animal in this image using one English word." },
            { type: "image_url", image_url: { url: SOURCE_URL } },
          ],
        },
      ],
      max_tokens: 32,
    });
    assert(!rpc.result?.isError, rpc.contentText || rpc.text);
    const answer = String(rpc.contentJson?.content ?? "");
    assert(/dog|puppy|canine/i.test(answer), `Unexpected vision answer: ${answer}`);
    return `trace=${rpc.contentJson?.traceId}; answer=${JSON.stringify(answer)}`;
  });

  await runCase("TC-IIV-065-REST", "REST chat real vision regression", async () => {
    const result = await jsonRequest("/v1/chat/completions", {
      model: "codex-vision",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Name the main animal in this image using one English word." },
            { type: "image_url", image_url: { url: SOURCE_URL } },
          ],
        },
      ],
      max_tokens: 32,
    });
    assert(result.response.status === 200, `HTTP ${result.response.status}: ${result.text}`);
    const answer = String(result.json?.choices?.[0]?.message?.content ?? "");
    assert(/dog|puppy|canine/i.test(answer), `Unexpected vision answer: ${answer}`);
    return `answer=${JSON.stringify(answer)}`;
  });

  await runCase("TC-IIV-060", "REST pure text-to-image real regression", async () =>
    runBilledImageCall("rest-t2i", undefined, "A simple red circle", async () => {
      const result = await jsonRequest("/v1/images/generations", {
        model: "seedream-4-5",
        prompt: "A simple red circle centered on a plain white background.",
      });
      return { status: result.response.status, body: result.json, text: result.text };
    }),
  );

  await runCase("TC-IIV-061", "MCP pure text-to-image real regression", async () => {
    const before = await userBalance();
    const rpc = await mcpTool("generate_image", {
      model: "seedream-4-5",
      prompt: "A simple blue square centered on a plain white background.",
    });
    assert(!rpc.result?.isError, rpc.contentText || rpc.text);
    const url = rpc.contentJson?.images?.[0];
    const traceId = rpc.contentJson?.traceId;
    assert(typeof url === "string" && typeof traceId === "string", rpc.contentText);
    const proxyEvidence = await assertProxyAndPersisted(url, "mcp-t2i");
    await assertImageBilling(traceId, undefined, "A simple blue square");
    const after = await userBalance();
    assert(
      before.minus(after).equals(IMAGE_SELL),
      `balance delta=${before.minus(after).toString()}`,
    );
    return `${proxyEvidence}; balance_delta=${before.minus(after).toString()}`;
  });

  await runCase("TC-IIV-062", "REST string chat real regression", async () => {
    const result = await jsonRequest("/v1/chat/completions", {
      model: "codex-vision",
      messages: [{ role: "user", content: "Reply with OK only." }],
      max_tokens: 16,
    });
    assert(result.response.status === 200, `HTTP ${result.response.status}: ${result.text}`);
    const answer = String(result.json?.choices?.[0]?.message?.content ?? "");
    assert(answer.length > 0, "Empty text response");
    return `answer=${JSON.stringify(answer)}`;
  });

  await runCase("TC-IIV-063", "MCP string chat real regression", async () => {
    const rpc = await mcpTool("chat", {
      model: "codex-vision",
      messages: [{ role: "user", content: "Reply with OK only." }],
      max_tokens: 16,
    });
    assert(!rpc.result?.isError, rpc.contentText || rpc.text);
    const answer = String(rpc.contentJson?.content ?? "");
    assert(answer.length > 0, "Empty MCP text response");
    return `trace=${rpc.contentJson?.traceId}; answer=${JSON.stringify(answer)}`;
  });

  await runCase("TC-IIV-055", "real upstream failure does not deduct", async () => {
    // MCP billing is async; settle the preceding success before taking the
    // baseline, then wait again to detect any delayed deduction for failure.
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    const before = await userBalance();
    const logsBefore = await prisma.callLog.count({ where: { projectId: PROJECT_ID } });
    const result = await jsonRequest("/v1/images/generations", {
      model: "seedream-4-5",
      prompt: "This source must fail upstream.",
      image: "http://127.0.0.1:1/not-an-image.png",
    });
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    const after = await userBalance();
    const logsAfter = await prisma.callLog.count({ where: { projectId: PROJECT_ID } });
    assert(result.response.status >= 400, `Expected failure, got ${result.response.status}`);
    assert(before.equals(after), `balance changed ${before.toString()} -> ${after.toString()}`);
    assert(
      logsAfter === logsBefore + 1,
      `Expected one ERROR CallLog, ${logsBefore} -> ${logsAfter}`,
    );
    const log = await prisma.callLog.findFirst({
      where: { projectId: PROJECT_ID },
      orderBy: { createdAt: "desc" },
    });
    assert(log?.status === "ERROR", `latest CallLog status=${log?.status}`);
    const transaction = await prisma.transaction.findFirst({ where: { traceId: log.traceId } });
    assert(!transaction, `Unexpected transaction ${transaction?.id}`);
    return `HTTP ${result.response.status}; balance unchanged=${after.toString()}; ERROR trace=${log.traceId}`;
  });

  for (const model of ["gpt-image", "gemini-3-pro-image"]) {
    await runCase(`TC-IIV-051-${model}`, `${model} real OpenRouter i2i`, async () => {
      const before = await userBalance();
      const result = await jsonRequest("/v1/images/generations", {
        model,
        prompt: "Turn the dog into a watercolor illustration.",
        image: SOURCE_URL,
      });
      const after = await userBalance();
      if (result.response.status === 200) {
        const url = result.json?.data?.[0]?.url;
        assert(typeof url === "string", result.text);
        const proxyEvidence = await assertProxyAndPersisted(url, `openrouter-${model}`);
        const traceId = traceFromProxyUrl(url);
        const log = await prisma.callLog.findUniqueOrThrow({ where: { traceId } });
        assert((log.promptTokens ?? 0) > 0, `promptTokens=${log.promptTokens}`);
        assert(before.greaterThan(after), "Successful OpenRouter call did not deduct balance");
        return `${proxyEvidence}; promptTokens=${log.promptTokens}; balance_delta=${before.minus(after)}`;
      }

      assert(before.equals(after), `Failed OpenRouter call deducted ${before.minus(after)}`);
      const log = await prisma.callLog.findFirst({
        where: { projectId: PROJECT_ID, modelName: model },
        orderBy: { createdAt: "desc" },
      });
      const diagnostic = `${result.response.status} ${result.text} ${log?.errorCode ?? ""} ${log?.errorMessage ?? ""}`;
      if (/402|insufficient.{0,20}(credit|balance)|payment required/i.test(diagnostic)) {
        throw new BlockedError(
          `OpenRouter account credit exhausted; HTTP ${result.response.status}; balance unchanged; trace=${log?.traceId}`,
        );
      }
      throw new Error(`Unexpected OpenRouter failure: ${diagnostic.slice(0, 1000)}`);
    });
  }

  const pass = results.filter((result) => result.status === "PASS").length;
  const fail = results.filter((result) => result.status === "FAIL").length;
  const blocked = results.filter((result) => result.status === "BLOCKED").length;
  console.log(`\nSUMMARY pass=${pass} fail=${fail} blocked=${blocked} total=${results.length}`);
  console.log(
    JSON.stringify(
      {
        pass,
        fail,
        blocked,
        total: results.length,
        source: { url: SOURCE_URL, type: sourceType, bytes: sourceBytes.length },
        results,
      },
      null,
      2,
    ),
  );
  if (fail > 0) process.exitCode = 1;
}

async function main() {
  if (process.argv.includes("--setup-real")) {
    await setupRealProviders();
  } else if (process.argv.includes("--run")) {
    await runL2();
  } else {
    throw new Error("Usage: --setup-real | --run");
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
