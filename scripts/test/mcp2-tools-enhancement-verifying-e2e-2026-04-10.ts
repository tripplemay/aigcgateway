import { createHash } from "crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { writeFileSync } from "fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BASE = process.env.BASE_URL ?? "http://localhost:3099";
const MCP_URL = `${BASE}/mcp`;
const OUTPUT =
  process.env.OUTPUT_FILE ?? "docs/test-reports/mcp2-tools-enhancement-verifying-2026-04-10.json";
const MOCK_PORT = Number(process.env.MOCK_PORT ?? "3345");
const MOCK_BASE = `http://127.0.0.1:${MOCK_PORT}/v1`;

type Step = { id: string; name: string; ok: boolean; detail: string };
type ApiResult = { status: number; body: any; text: string };
type MockChatRequest = {
  stream: boolean;
  body: any;
};
type RestoreState = {
  providerId: string;
  baseUrl: string;
  authConfig: unknown;
  proxyUrl: string | null;
};

const tag = Date.now().toString(36);
const email = `mcp2_${tag}@test.local`;
const password = "Test1234";
const keyName = `mcp2-key-${tag}`;
const projectName = `MCP2 Project ${tag}`;
const textAlias = `mcp2-chat-${tag}`;
const imageAlias = `mcp2-image-${tag}`;
const textModelName = `mcp2/${tag}/text-raw`;
const imageModelA = `mcp2/${tag}/image-a`;
const imageModelB = `mcp2/${tag}/image-b`;

let token = "";
let apiKey = "";
let revokedKey = "";
let userId = "";
let projectId = "";
let mockRequests: MockChatRequest[] = [];
let toolListNames: string[] = [];

function json(res: ServerResponse, status: number, body: unknown, headers?: Record<string, string>) {
  res.writeHead(status, { "Content-Type": "application/json", ...(headers ?? {}) });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function startMockServer() {
  const server = createServer(async (req, res) => {
    if (req.method === "POST" && req.url === "/v1/chat/completions") {
      const text = await readBody(req);
      const body = JSON.parse(text || "{}");
      mockRequests.push({ stream: !!body.stream, body });

      if (body.stream) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        res.write(
          `data: ${JSON.stringify({
            id: "chatcmpl-stream-1",
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: body.model,
            choices: [
              {
                index: 0,
                delta: {
                  role: "assistant",
                  content: "stream-hello ",
                  tool_calls: [
                    {
                      index: 0,
                      id: "call_stream_1",
                      type: "function",
                      function: { name: "lookupWeather", arguments: "{\"city\":\"Shang" },
                    },
                  ],
                },
                finish_reason: null,
              },
            ],
          })}\n\n`,
        );
        res.write(
          `data: ${JSON.stringify({
            id: "chatcmpl-stream-1",
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: body.model,
            choices: [
              {
                index: 0,
                delta: {
                  content: "done",
                  tool_calls: [
                    {
                      index: 0,
                      function: { arguments: "hai\"}" },
                    },
                  ],
                },
                finish_reason: "tool_calls",
              },
            ],
            usage: { prompt_tokens: 9, completion_tokens: 6, total_tokens: 15 },
          })}\n\n`,
        );
        res.write("data: [DONE]\n\n");
        res.end();
        return;
      }

      if (Array.isArray(body.tools) && body.tools.length > 0) {
        json(res, 200, {
          id: "chatcmpl-tools",
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: body.model,
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call_nonstream_1",
                    type: "function",
                    function: {
                      name: body.tool_choice?.function?.name ?? "lookupWeather",
                      arguments: "{\"city\":\"Shanghai\"}",
                    },
                  },
                ],
              },
              finish_reason: "tool_calls",
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
        });
        return;
      }

      json(res, 200, {
        id: "chatcmpl-params",
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: body.model,
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: `top_p=${body.top_p};freq=${body.frequency_penalty};presence=${body.presence_penalty};stop=${JSON.stringify(body.stop)}`,
            },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 8, completion_tokens: 5, total_tokens: 13 },
      });
      return;
    }

    json(res, 404, { error: "not_found" });
  });

  await new Promise<void>((resolve) => server.listen(MOCK_PORT, "127.0.0.1", resolve));
  return server;
}

async function api(
  path: string,
  init?: RequestInit & { expect?: number; auth?: "jwt" | "key" | "none"; apiKeyOverride?: string },
) {
  const { expect, auth = "jwt", apiKeyOverride, ...rest } = init ?? {};
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(rest.headers as Record<string, string> | undefined),
  };
  if (auth === "jwt" && token) headers.Authorization = `Bearer ${token}`;
  if (auth === "key" && (apiKeyOverride || apiKey)) {
    headers.Authorization = `Bearer ${apiKeyOverride ?? apiKey}`;
  }

  const res = await fetch(`${BASE}${path}`, { ...rest, headers });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (typeof expect === "number" && res.status !== expect) {
    throw new Error(`${path} expected ${expect}, got ${res.status}: ${JSON.stringify(body)}`);
  }
  return { status: res.status, body, text } as ApiResult;
}

async function rawMcp(
  rawKey: string,
  method: string,
  params?: Record<string, unknown>,
): Promise<ApiResult> {
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${rawKey}`,
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params: params ?? {},
    }),
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    const lines = text.split("\n");
    let lastData = "";
    for (const line of lines) {
      if (line.startsWith("data: ")) lastData = line.slice(6);
    }
    body = lastData ? JSON.parse(lastData) : text;
  }
  return { status: res.status, body, text } as ApiResult;
}

async function callTool(name: string, args: Record<string, unknown> = {}, rawKey = apiKey) {
  const rpc = await rawMcp(rawKey, "tools/call", { name, arguments: args });
  if (rpc.status >= 400) throw new Error(`tools/call ${name} http ${rpc.status}: ${rpc.text}`);
  if (rpc.body?.error) throw new Error(`tools/call ${name} rpc error: ${JSON.stringify(rpc.body.error)}`);
  const result = rpc.body?.result ?? rpc.body;
  if (result?.isError) throw new Error(`tools/call ${name} tool error: ${result?.content?.[0]?.text ?? "unknown"}`);
  return result;
}

async function callToolAllowError(name: string, args: Record<string, unknown> = {}, rawKey = apiKey) {
  const rpc = await rawMcp(rawKey, "tools/call", { name, arguments: args });
  if (rpc.status >= 400) return rpc;
  if (rpc.body?.error) return rpc;
  return { ...rpc, body: rpc.body?.result ?? rpc.body };
}

function parseToolJson(result: any): any {
  const text = result?.content?.[0]?.text ?? "";
  if (!text) throw new Error("No text content in MCP result");
  return JSON.parse(text);
}

async function registerAndLogin() {
  await api("/api/auth/register", {
    method: "POST",
    auth: "none",
    expect: 201,
    body: JSON.stringify({ email, password, name: "MCP2 Evaluator" }),
  });
  const login = await api("/api/auth/login", {
    method: "POST",
    auth: "none",
    expect: 200,
    body: JSON.stringify({ email, password }),
  });
  token = String(login.body?.token ?? "");
  const user = await prisma.user.findUniqueOrThrow({
    where: { email },
    select: { id: true },
  });
  userId = user.id;
  await prisma.user.update({ where: { id: userId }, data: { balance: 20 } });
}

async function createInitialApiKey() {
  const created = await api("/api/keys", {
    method: "POST",
    expect: 201,
    body: JSON.stringify({ name: keyName }),
  });
  apiKey = String(created.body?.key ?? "");
  if (!apiKey.startsWith("pk_")) throw new Error("initial API key missing");
}

async function patchProviderForMock(): Promise<RestoreState> {
  const provider = await prisma.provider.findUniqueOrThrow({
    where: { name: "openai" },
    select: { id: true, baseUrl: true, authConfig: true, proxyUrl: true },
  });
  await prisma.provider.update({
    where: { id: provider.id },
    data: { baseUrl: MOCK_BASE, authConfig: { apiKey: "mock-openai-key" }, proxyUrl: null },
  });
  return {
    providerId: provider.id,
    baseUrl: provider.baseUrl,
    authConfig: provider.authConfig,
    proxyUrl: provider.proxyUrl,
  };
}

async function restoreProvider(state: RestoreState) {
  await prisma.provider.update({
    where: { id: state.providerId },
    data: { baseUrl: state.baseUrl, authConfig: state.authConfig as any, proxyUrl: state.proxyUrl },
  });
}

async function createModelFixtures(providerId: string) {
  const textModel = await prisma.model.create({
    data: {
      name: textModelName,
      displayName: textModelName,
      modality: "TEXT",
      enabled: true,
      capabilities: { function_calling: true, streaming: true, json_mode: true },
    },
  });
  const imageModel1 = await prisma.model.create({
    data: {
      name: imageModelA,
      displayName: imageModelA,
      modality: "IMAGE",
      enabled: true,
      supportedSizes: ["1024x1024", "1024x1792"],
    },
  });
  const imageModel2 = await prisma.model.create({
    data: {
      name: imageModelB,
      displayName: imageModelB,
      modality: "IMAGE",
      enabled: true,
      supportedSizes: ["1024x1024", "1792x1024"],
    },
  });

  const textAliasRow = await prisma.modelAlias.create({
    data: {
      alias: textAlias,
      brand: "OpenAI",
      modality: "TEXT",
      enabled: true,
      capabilities: { function_calling: true, streaming: true, json_mode: true },
    },
  });
  const imageAliasRow = await prisma.modelAlias.create({
    data: {
      alias: imageAlias,
      brand: "OpenAI",
      modality: "IMAGE",
      enabled: true,
      capabilities: { vision: true, image_input: false },
    },
  });

  await prisma.aliasModelLink.createMany({
    data: [
      { aliasId: textAliasRow.id, modelId: textModel.id },
      { aliasId: imageAliasRow.id, modelId: imageModel1.id },
      { aliasId: imageAliasRow.id, modelId: imageModel2.id },
    ],
  });

  await prisma.channel.createMany({
    data: [
      {
        providerId,
        modelId: textModel.id,
        realModelId: "gpt-4o-mini",
        priority: 1,
        status: "ACTIVE",
        costPrice: { unit: "token", inputPer1M: 0.1, outputPer1M: 0.2, currency: "USD" },
        sellPrice: { unit: "token", inputPer1M: 0.12, outputPer1M: 0.24, currency: "USD" },
      },
      {
        providerId,
        modelId: imageModel1.id,
        realModelId: "gpt-image-1",
        priority: 1,
        status: "ACTIVE",
        costPrice: { unit: "call", perCall: 0.01, currency: "USD" },
        sellPrice: { unit: "call", perCall: 0.012, currency: "USD" },
      },
      {
        providerId,
        modelId: imageModel2.id,
        realModelId: "gpt-image-1",
        priority: 2,
        status: "ACTIVE",
        costPrice: { unit: "call", perCall: 0.01, currency: "USD" },
        sellPrice: { unit: "call", perCall: 0.012, currency: "USD" },
      },
    ],
  });
}

async function cleanupFixtures() {
  await prisma.callLog.deleteMany({ where: { projectId } });
  await prisma.aliasModelLink.deleteMany({
    where: {
      OR: [
        { alias: { alias: { in: [textAlias, imageAlias] } } },
        { model: { name: { in: [textModelName, imageModelA, imageModelB] } } },
      ],
    },
  });
  await prisma.channel.deleteMany({
    where: { model: { name: { in: [textModelName, imageModelA, imageModelB] } } },
  });
  await prisma.modelAlias.deleteMany({ where: { alias: { in: [textAlias, imageAlias] } } });
  await prisma.model.deleteMany({ where: { name: { in: [textModelName, imageModelA, imageModelB] } } });
  if (userId) {
    await prisma.apiKey.deleteMany({ where: { userId } });
    await prisma.project.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  }
}

async function run() {
  const steps: Step[] = [];
  const mock = await startMockServer();
  const providerState = await patchProviderForMock();

  try {
    await registerAndLogin();
    await createInitialApiKey();

    const init = await rawMcp(apiKey, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "mcp2-evaluator", version: "1.0.0" },
    });
    const instructions = String(init.body?.result?.instructions ?? init.body?.instructions ?? "");
    const initOk = init.status === 200 && instructions.includes("create_api_key") && instructions.includes("presence_penalty") && instructions.includes("supportedSizes") && instructions.includes("brand");
    steps.push({
      id: "AC1",
      name: "MCP initialize 返回 SERVER_INSTRUCTIONS，内容覆盖 MCP2 新能力",
      ok: initOk,
      detail: `status=${init.status}, has_create_api_key=${instructions.includes("create_api_key")}, has_presence_penalty=${instructions.includes("presence_penalty")}, has_supportedSizes=${instructions.includes("supportedSizes")}, has_brand=${instructions.includes("brand")}`,
    });

    const toolsList = await rawMcp(apiKey, "tools/list");
    toolListNames = (toolsList.body?.result?.tools ?? []).map((t: any) => String(t.name));
    const requiredTools = ["list_api_keys", "create_api_key", "revoke_api_key", "get_project_info", "create_project"];
    const toolsOk = requiredTools.every((name) => toolListNames.includes(name));
    steps.push({
      id: "AC2",
      name: "tools/list 暴露 API Key 管理与项目管理工具",
      ok: toolsOk,
      detail: `tools=${requiredTools.filter((name) => toolListNames.includes(name)).join(",")}`,
    });

    const noProject = await callTool("get_project_info");
    const noProjectMsg = parseToolJson(noProject);
    const noProjectOk = String(noProjectMsg.message ?? "").includes("No default project configured");
    steps.push({
      id: "AC3",
      name: "无默认项目时 get_project_info 返回友好提示",
      ok: noProjectOk,
      detail: JSON.stringify(noProjectMsg),
    });

    const createdProject = parseToolJson(
      await callTool("create_project", { name: projectName, description: "MCP2 verification project" }),
    );
    projectId = String(createdProject.id ?? "");
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { defaultProjectId: true },
    });
    const createProjectOk = !!projectId && user.defaultProjectId === projectId;
    steps.push({
      id: "AC4",
      name: "create_project 创建项目并设为 defaultProjectId",
      ok: createProjectOk,
      detail: `project_id=${projectId}, default_project_id=${user.defaultProjectId}`,
    });

    await createModelFixtures(providerState.providerId);

    const imageModels = parseToolJson(await callTool("list_models", { modality: "image" }));
    const targetImage = Array.isArray(imageModels)
      ? imageModels.find((m: any) => m?.name === imageAlias)
      : null;
    const sizes = Array.isArray(targetImage?.supportedSizes) ? targetImage.supportedSizes : [];
    const sizesOk = JSON.stringify(sizes) === JSON.stringify(["1024x1024", "1024x1792", "1792x1024"]);
    steps.push({
      id: "AC5",
      name: "list_models(image) 返回聚合后的 supportedSizes",
      ok: sizesOk,
      detail: `supportedSizes=${JSON.stringify(sizes)}`,
    });

    const listBefore = parseToolJson(await callTool("list_api_keys"));
    const listBeforeOk =
      Array.isArray(listBefore) &&
      listBefore.some((k: any) => k?.name === keyName && typeof k?.maskedKey === "string" && !String(k.maskedKey).includes(apiKey));
    steps.push({
      id: "AC6",
      name: "list_api_keys 返回 maskedKey/name/status/createdAt",
      ok: listBeforeOk,
      detail: `count=${Array.isArray(listBefore) ? listBefore.length : "n/a"}`,
    });

    const createdKey = parseToolJson(
      await callTool("create_api_key", { name: `mcp2-extra-${tag}`, description: "created via MCP" }),
    );
    revokedKey = String(createdKey.key ?? "");
    const createdKeyOk = revokedKey.startsWith("pk_") && String(createdKey.warning ?? "").includes("NOT be shown again");
    steps.push({
      id: "AC7",
      name: "create_api_key 返回完整 key，且仅一次可见",
      ok: createdKeyOk,
      detail: `id=${createdKey.id}, key_prefix=${revokedKey.slice(0, 8)}`,
    });

    const listAfterCreate = parseToolJson(await callTool("list_api_keys"));
    const createdListHit = Array.isArray(listAfterCreate)
      ? listAfterCreate.find((k: any) => k?.id === createdKey.id)
      : null;
    const maskedOk =
      !!createdListHit &&
      typeof createdListHit.maskedKey === "string" &&
      !String(createdListHit.maskedKey).includes(revokedKey) &&
      createdListHit.status === "active";
    steps.push({
      id: "AC8",
      name: "新建 key 在 list_api_keys 中仅以 maskedKey 形式出现",
      ok: maskedOk,
      detail: JSON.stringify(createdListHit),
    });

    const revokeResult = parseToolJson(await callTool("revoke_api_key", { keyId: createdKey.id }));
    const revokedList = parseToolJson(await callTool("list_api_keys"));
    const revokedHit = Array.isArray(revokedList) ? revokedList.find((k: any) => k?.id === createdKey.id) : null;
    const revokedOk = revokeResult.status === "revoked" && revokedHit?.status === "revoked";
    steps.push({
      id: "AC9",
      name: "revoke_api_key 吊销后立即生效",
      ok: revokedOk,
      detail: `revoke=${JSON.stringify(revokeResult)}, list_status=${revokedHit?.status ?? "missing"}`,
    });

    const revokedInit = await rawMcp(revokedKey, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "revoked-key-test", version: "1.0.0" },
    });
    const revokedAuthOk = revokedInit.status === 401;
    steps.push({
      id: "AC10",
      name: "被吊销 key 再访问 MCP 认证失败",
      ok: revokedAuthOk,
      detail: `status=${revokedInit.status}, body=${revokedInit.text.slice(0, 120)}`,
    });

    const functionCallTools = [
      {
        type: "function",
        function: {
          name: "lookupWeather",
          description: "Look up weather",
          parameters: {
            type: "object",
            properties: { city: { type: "string" } },
            required: ["city"],
          },
        },
      },
    ];
    const nonStreamChat = parseToolJson(
      await callTool("chat", {
        model: textAlias,
        messages: [{ role: "user", content: "Use tool" }],
        tools: functionCallTools,
        tool_choice: { type: "function", function: { name: "lookupWeather" } },
        max_tokens: 20,
      }),
    );
    const lastNonStreamReq = [...mockRequests].reverse().find((r) => !r.stream);
    const functionCallingOk =
      Array.isArray(nonStreamChat.tool_calls) &&
      nonStreamChat.tool_calls[0]?.function?.name === "lookupWeather" &&
      !!lastNonStreamReq?.body?.tools &&
      lastNonStreamReq?.body?.tool_choice?.function?.name === "lookupWeather";
    steps.push({
      id: "AC11",
      name: "chat 传 tools/tool_choice 可触发 function calling",
      ok: functionCallingOk,
      detail: `tool_calls=${JSON.stringify(nonStreamChat.tool_calls)}, request_has_tools=${!!lastNonStreamReq?.body?.tools}`,
    });

    const paramsChat = parseToolJson(
      await callTool("chat", {
        model: textAlias,
        messages: [{ role: "user", content: "Use params" }],
        top_p: 0.6,
        frequency_penalty: 0.4,
        presence_penalty: 0.7,
        stop: ["STOP1", "STOP2"],
        max_tokens: 20,
      }),
    );
    const paramsReq = [...mockRequests].reverse().find((r) => !r.stream && !Array.isArray(r.body.tools));
    const paramsOk =
      paramsReq?.body?.top_p === 0.6 &&
      paramsReq?.body?.frequency_penalty === 0.4 &&
      paramsReq?.body?.presence_penalty === 0.7 &&
      JSON.stringify(paramsReq?.body?.stop) === JSON.stringify(["STOP1", "STOP2"]) &&
      paramsChat.finishReason === "stop";
    steps.push({
      id: "AC12",
      name: "chat 传 top_p/penalties/stop 正常透传并返回 finishReason",
      ok: paramsOk,
      detail: `request=${JSON.stringify(paramsReq?.body ?? {})}, response=${JSON.stringify(paramsChat)}`,
    });

    const streamChat = parseToolJson(
      await callTool("chat", {
        model: textAlias,
        messages: [{ role: "user", content: "Stream tool call" }],
        tools: functionCallTools,
        tool_choice: "required",
        stream: true,
        max_tokens: 20,
      }),
    );
    const streamReq = [...mockRequests].reverse().find((r) => r.stream);
    const streamOk =
      typeof streamChat.ttftMs === "number" &&
      Array.isArray(streamChat.tool_calls) &&
      streamChat.tool_calls[0]?.function?.arguments === "{\"city\":\"Shanghai\"}" &&
      streamReq?.body?.stream === true;
    steps.push({
      id: "AC13",
      name: "stream=true 时返回 ttftMs 并正确累积 tool_calls",
      ok: streamOk,
      detail: `stream_result=${JSON.stringify(streamChat)}, request_stream=${streamReq?.body?.stream ?? "missing"}`,
    });

    const projectInfo = parseToolJson(await callTool("get_project_info"));
    const projectInfoOk =
      projectInfo.name === projectName &&
      projectInfo.description === "MCP2 verification project" &&
      typeof projectInfo.callCount === "number" &&
      typeof projectInfo.keyCount === "number" &&
      projectInfo.keyCount >= 2;
    steps.push({
      id: "AC14",
      name: "get_project_info 返回当前项目名称、描述、创建时间、调用数、Key 数",
      ok: projectInfoOk,
      detail: JSON.stringify(projectInfo),
    });

    const ok = steps.every((s) => s.ok);
    writeFileSync(
      OUTPUT,
      JSON.stringify(
        {
          ok,
          executedAt: new Date().toISOString(),
          output: OUTPUT,
          toolListNames,
          steps,
          mockRequests: mockRequests.map((r) => r.body),
        },
        null,
        2,
      ),
    );
    if (!ok) {
      throw new Error(
        steps
          .filter((s) => !s.ok)
          .map((s) => `${s.id}: ${s.detail}`)
          .join("\n"),
      );
    }
  } finally {
    await cleanupFixtures().catch(() => {});
    await restoreProvider(providerState).catch(() => {});
    await new Promise<void>((resolve, reject) => {
      mock.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    }).catch(() => {});
    await prisma.$disconnect();
  }
}

run().catch((err) => {
  writeFileSync(
    OUTPUT,
    JSON.stringify(
      {
        ok: false,
        executedAt: new Date().toISOString(),
        output: OUTPUT,
        error: err instanceof Error ? err.message : String(err),
        toolListNames,
        mockRequests: mockRequests.map((r) => r.body),
      },
      null,
      2,
    ),
  );
  console.error(err);
  process.exit(1);
});
