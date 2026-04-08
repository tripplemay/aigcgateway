import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";

const BASE = process.env.BASE_URL ?? "http://localhost:3099";
const MOCK_PORT = Number(process.env.MOCK_PORT ?? "3310");
const MOCK_BASE = `http://127.0.0.1:${MOCK_PORT}/v1`;
const prisma = new PrismaClient();

type StepResult = {
  name: string;
  ok: boolean;
  detail?: string;
};

type EventPayload = Record<string, unknown>;

let token = "";
let projectId = "";
let apiKey = "";
const email = `p4_${Date.now()}@test.com`;
const password = "Test1234";

let singleActionId = "";
let singleActionVersion2Id = "";
let sequentialTemplateId = "";
let fanoutTemplateId = "";
let singleTraceId = "";
let sequentialTraceIds: string[] = [];
let fanoutTraceIds: string[] = [];

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function buildMockOutput(input: string): string {
  if (input.startsWith("SPLIT:")) {
    const raw = input.slice("SPLIT:".length).trim();
    const parts = raw
      .split("|")
      .map((p) => p.trim())
      .filter(Boolean)
      .map((content) => ({ content }));
    return JSON.stringify(parts);
  }
  if (input.startsWith("BRANCH:")) {
    return `BRANCH(${input.slice("BRANCH:".length).trim()})`;
  }
  if (input.startsWith("MERGE:")) {
    return `MERGE(${input.slice("MERGE:".length).trim()})`;
  }
  return `OUT(${input.trim()})`;
}

function extractPrompt(body: any): string {
  const lastUser = [...(body.messages ?? [])]
    .reverse()
    .find((m: any) => m?.role === "user");
  return String(lastUser?.content ?? "");
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
    if (req.method !== "POST" || req.url !== "/v1/chat/completions") {
      json(res, 404, { error: "not_found" });
      return;
    }

    const text = await readBody(req);
    const body = JSON.parse(text || "{}");
    const prompt = extractPrompt(body);
    const output = buildMockOutput(prompt);
    const created = Math.floor(Date.now() / 1000);
    const usage = { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 };

    if (body.stream) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      const pieces =
        output.length <= 8
          ? [output]
          : [output.slice(0, Math.ceil(output.length / 2)), output.slice(Math.ceil(output.length / 2))];

      for (const piece of pieces) {
        const chunk = {
          id: "chatcmpl-mock",
          object: "chat.completion.chunk",
          created,
          model: body.model ?? "gpt-4o-mini",
          choices: [{ index: 0, delta: { content: piece }, finish_reason: null }],
        };
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }

      const finalChunk = {
        id: "chatcmpl-mock",
        object: "chat.completion.chunk",
        created,
        model: body.model ?? "gpt-4o-mini",
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        usage,
      };
      res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    json(res, 200, {
      id: "chatcmpl-mock",
      object: "chat.completion",
      created,
      model: body.model ?? "gpt-4o-mini",
      choices: [{ index: 0, message: { role: "assistant", content: output }, finish_reason: "stop" }],
      usage,
    });
  });

  await new Promise<void>((resolve) => server.listen(MOCK_PORT, "127.0.0.1", () => resolve()));
  return server;
}

async function api(path: string, init?: RequestInit & { expect?: number; auth?: "jwt" | "key" | "none" }) {
  const { expect, auth = "jwt", ...rest } = init ?? {};
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(rest.headers as Record<string, string> | undefined),
  };
  if (auth === "jwt" && token) headers.Authorization = `Bearer ${token}`;
  if (auth === "key" && apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const res = await fetch(`${BASE}${path}`, { ...rest, headers });
  const body = await res.text();
  let parsed: any = null;
  try {
    parsed = body ? JSON.parse(body) : null;
  } catch {
    parsed = body;
  }
  if (expect && res.status !== expect) {
    throw new Error(`${path} expected ${expect}, got ${res.status}: ${JSON.stringify(parsed)}`);
  }
  return { res, body: parsed, text: body };
}

async function registerAndLogin() {
  await api("/api/auth/register", {
    method: "POST",
    auth: "none",
    expect: 201,
    body: JSON.stringify({ email, password, name: "P4 Local Tester" }),
  });
  const login = await api("/api/auth/login", {
    method: "POST",
    auth: "none",
    expect: 200,
    body: JSON.stringify({ email, password }),
  });
  token = login.body.token;

  // Balance is stored at user-level after balance-user-level-backend batch.
  await prisma.user.update({
    where: { email },
    data: { balance: 50 },
  });
}

async function createProjectAndKey() {
  const project = await api("/api/projects", {
    method: "POST",
    expect: 201,
    body: JSON.stringify({ name: `P4 Project ${Date.now()}` }),
  });
  projectId = project.body.id;

  const key = await api(`/api/projects/${projectId}/keys`, {
    method: "POST",
    expect: 201,
    body: JSON.stringify({ name: "p4-local-key" }),
  });
  apiKey = key.body.key;

  await prisma.project.update({
    where: { id: projectId },
    data: { balance: 10 },
  });
}

async function configureLocalProvider() {
  const targetModel = await prisma.model.findUniqueOrThrow({
    where: { name: "openai/gpt-4o-mini" },
  });
  const modelInitialEnabled = targetModel.enabled;
  if (!targetModel.enabled) {
    await prisma.model.update({
      where: { id: targetModel.id },
      data: { enabled: true },
    });
  }
  const chosenChannel = await prisma.channel.findFirstOrThrow({
    where: { modelId: targetModel.id },
    include: { provider: true },
  });
  const siblingChannels = await prisma.channel.findMany({
    where: {
      modelId: targetModel.id,
      id: { not: chosenChannel.id },
    },
  });

  return {
    restore: {
      modelId: targetModel.id,
      modelEnabled: modelInitialEnabled,
      providerId: chosenChannel.provider.id,
      providerBaseUrl: chosenChannel.provider.baseUrl,
      providerAuthConfig: chosenChannel.provider.authConfig,
      chosenChannelId: chosenChannel.id,
      chosenChannelStatus: chosenChannel.status,
      siblingChannels: siblingChannels.map((c) => ({ id: c.id, status: c.status })),
    },
    async apply() {
      await prisma.provider.update({
        where: { id: chosenChannel.provider.id },
        data: {
          baseUrl: MOCK_BASE,
          authConfig: { apiKey: "mock-provider-key" },
          proxyUrl: null,
        },
      });
      await prisma.channel.update({
        where: { id: chosenChannel.id },
        data: { status: "ACTIVE" },
      });
      for (const sibling of siblingChannels) {
        await prisma.channel.update({
          where: { id: sibling.id },
          data: { status: "DISABLED" },
        });
      }
    },
    async rollback() {
      await prisma.model.update({
        where: { id: targetModel.id },
        data: { enabled: modelInitialEnabled },
      }).catch(() => {});
      await prisma.provider.update({
        where: { id: chosenChannel.provider.id },
        data: {
          baseUrl: chosenChannel.provider.baseUrl,
          authConfig: chosenChannel.provider.authConfig,
        },
      });
      await prisma.channel.update({
        where: { id: chosenChannel.id },
        data: { status: chosenChannel.status },
      });
      for (const sibling of siblingChannels) {
        await prisma.channel.update({
          where: { id: sibling.id },
          data: { status: sibling.status },
        });
      }
    },
  };
}

function parseSseEvents(text: string): EventPayload[] {
  return text
    .split("\n\n")
    .map((block) => block.trim())
    .filter(Boolean)
    .flatMap((block) => {
      const line = block
        .split("\n")
        .find((l) => l.startsWith("data: "));
      if (!line) return [];
      const payload = line.slice(6);
      if (payload === "[DONE]") return [{ type: "[DONE]" }];
      try {
        return [JSON.parse(payload)];
      } catch {
        return [];
      }
    });
}

async function waitForCallLogs(where: Record<string, unknown>, countAtLeast = 1) {
  for (let i = 0; i < 20; i++) {
    const logs = await prisma.callLog.findMany({
      where: where as any,
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    if (logs.length >= countAtLeast) return logs;
    await new Promise((r) => setTimeout(r, 300));
  }
  return prisma.callLog.findMany({
    where: where as any,
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}

async function mcpRequest(method: string, params?: Record<string, unknown>) {
  const res = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
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
  if (!res.ok) throw new Error(`MCP ${method} HTTP ${res.status}: ${text}`);
  try {
    return JSON.parse(text);
  } catch {
    const events = parseSseEvents(text);
    return events.at(-1);
  }
}

async function createAction(input: {
  name: string;
  model?: string;
  content: string;
  variables: Array<{ name: string; description: string; required: boolean }>;
}) {
  const res = await api(`/api/projects/${projectId}/actions`, {
    method: "POST",
    expect: 201,
    body: JSON.stringify({
      name: input.name,
      description: input.name,
      model: input.model ?? "openai/gpt-4o-mini",
      messages: [{ role: "user", content: input.content }],
      variables: input.variables,
      changelog: "init",
    }),
  });
  return res.body;
}

async function createTemplate(input: {
  name: string;
  description: string;
  steps: Array<{ actionId: string; order: number; role: string }>;
}) {
  const res = await api(`/api/projects/${projectId}/templates`, {
    method: "POST",
    expect: 201,
    body: JSON.stringify(input),
  });
  return res.body;
}

async function run() {
  const results: StepResult[] = [];
  const push = (name: string, ok: boolean, detail?: string) => results.push({ name, ok, detail });

  const server = await startMockServer();
  const providerFixture = await configureLocalProvider();

  try {
    await providerFixture.apply();
    await registerAndLogin();
    await createProjectAndKey();

    const actionV1 = await createAction({
      name: "single-action",
      content: "OLD {{topic}}",
      variables: [{ name: "topic", description: "topic", required: true }],
    });
    singleActionId = actionV1.id;

    const v2 = await api(`/api/projects/${projectId}/actions/${singleActionId}/versions`, {
      method: "POST",
      expect: 201,
      body: JSON.stringify({
        messages: [{ role: "user", content: "NEW {{topic}}" }],
        variables: [{ name: "topic", description: "topic", required: true }],
        changelog: "v2",
      }),
    });
    singleActionVersion2Id = v2.body.id;

    await api(`/api/projects/${projectId}/actions/${singleActionId}/active-version`, {
      method: "PUT",
      expect: 200,
      body: JSON.stringify({ versionId: singleActionVersion2Id }),
    });

    const singleRun = await api("/v1/actions/run", {
      method: "POST",
      auth: "key",
      expect: 200,
      body: JSON.stringify({
        action_id: singleActionId,
        variables: { topic: "alpha" },
        stream: true,
      }),
    });
    const singleEvents = parseSseEvents(singleRun.text);
    const singleEventTypes = singleEvents.map((e) => String(e.type));
    const singleContent = singleEvents
      .filter((e) => e.type === "content")
      .map((e) => String(e.delta ?? ""))
      .join("");
    const singleOk =
      singleEventTypes.includes("action_start") &&
      singleEventTypes.includes("action_end") &&
      singleContent.includes("NEW alpha");
    push("action stream", singleOk, JSON.stringify(singleEventTypes));

    const singleLogs = await waitForCallLogs({ projectId, actionId: singleActionId });
    const latestSingle = singleLogs[0];
    singleTraceId = latestSingle?.traceId ?? "";
    push(
      "action call_log",
      Boolean(
        latestSingle &&
          latestSingle.actionId === singleActionId &&
          latestSingle.actionVersionId === singleActionVersion2Id,
      ),
      latestSingle
        ? JSON.stringify({
            traceId: latestSingle.traceId,
            actionId: latestSingle.actionId,
            actionVersionId: latestSingle.actionVersionId,
          })
        : "missing",
    );

    const seq1 = await createAction({
      name: "seq-1",
      content: "SEQ1 {{topic}}",
      variables: [{ name: "topic", description: "topic", required: true }],
    });
    const seq2 = await createAction({
      name: "seq-2",
      content: "SEQ2 {{previous_output}}",
      variables: [{ name: "previous_output", description: "prev", required: true }],
    });
    const seqTpl = await createTemplate({
      name: "seq-template",
      description: "seq",
      steps: [
        { actionId: seq1.id, order: 0, role: "SEQUENTIAL" },
        { actionId: seq2.id, order: 1, role: "SEQUENTIAL" },
      ],
    });
    sequentialTemplateId = seqTpl.id;

    const seqRun = await api("/v1/templates/run", {
      method: "POST",
      auth: "key",
      expect: 200,
      body: JSON.stringify({
        template_id: sequentialTemplateId,
        variables: { topic: "beta" },
        stream: true,
      }),
    });
    const seqEvents = parseSseEvents(seqRun.text);
    const stepStarts = seqEvents.filter((e) => e.type === "step_start");
    const seqStep2Content = seqEvents
      .filter((e) => e.type === "content" && e.step === 1)
      .map((e) => String(e.delta ?? ""))
      .join("");
    push(
      "sequential stream",
      stepStarts.length === 2 && seqStep2Content.includes("SEQ1 beta"),
      JSON.stringify({
        stepStarts: stepStarts.length,
        step2Content: seqStep2Content,
      }),
    );

    const seqLogs = await waitForCallLogs({ projectId, templateRunId: { not: null } }, 2);
    const seqRunGroup = seqLogs.find((l) => l.templateRunId)?.templateRunId;
    const seqGrouped = seqRunGroup
      ? await prisma.callLog.findMany({
          where: { projectId, templateRunId: seqRunGroup },
          orderBy: { createdAt: "asc" },
        })
      : [];
    sequentialTraceIds = seqGrouped.map((l) => l.traceId);
    push(
      "sequential call_logs",
      seqGrouped.length >= 2 && seqGrouped.every((l) => l.templateRunId === seqRunGroup),
      JSON.stringify(seqGrouped.map((l) => ({ actionId: l.actionId, templateRunId: l.templateRunId }))),
    );

    const splitter = await createAction({
      name: "splitter",
      content: "SPLIT: {{items}}",
      variables: [{ name: "items", description: "items", required: true }],
    });
    const branch = await createAction({
      name: "branch",
      content: "BRANCH: {{branch_input}}",
      variables: [{ name: "branch_input", description: "branch_input", required: true }],
    });
    const merge = await createAction({
      name: "merge",
      content: "MERGE: {{all_outputs}}",
      variables: [{ name: "all_outputs", description: "all_outputs", required: true }],
    });
    const fanTpl = await createTemplate({
      name: "fan-template",
      description: "fan",
      steps: [
        { actionId: splitter.id, order: 0, role: "SPLITTER" },
        { actionId: branch.id, order: 1, role: "BRANCH" },
        { actionId: merge.id, order: 2, role: "MERGE" },
      ],
    });
    fanoutTemplateId = fanTpl.id;

    const fanRun = await api("/v1/templates/run", {
      method: "POST",
      auth: "key",
      expect: 200,
      body: JSON.stringify({
        template_id: fanoutTemplateId,
        variables: { items: "red|blue|green" },
        stream: true,
      }),
    });
    const fanEvents = parseSseEvents(fanRun.text);
    const branchStarts = fanEvents.filter((e) => e.type === "branch_start");
    const mergeContent = fanEvents
      .filter((e) => e.type === "content" && e.step === 2)
      .map((e) => String(e.delta ?? ""))
      .join("");
    push(
      "fanout stream",
      branchStarts.length === 3 &&
        mergeContent.includes('["BRANCH(red)"') &&
        mergeContent.includes("BRANCH(green)"),
      JSON.stringify({ branches: branchStarts.length, mergeContent }),
    );

    const fanLogs = await waitForCallLogs({ projectId, templateRunId: { not: null } }, 5);
    const latestTemplateRunId = fanLogs[0]?.templateRunId;
    const fanGrouped = latestTemplateRunId
      ? await prisma.callLog.findMany({
          where: { projectId, templateRunId: latestTemplateRunId },
          orderBy: { createdAt: "asc" },
        })
      : [];
    fanoutTraceIds = fanGrouped.map((l) => l.traceId);
    push("fanout call_logs", fanGrouped.length >= 5, `count=${fanGrouped.length}`);

    const init = await mcpRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "p4-tester", version: "1.0.0" },
    });
    push("mcp initialize", Boolean(init?.result?.serverInfo?.name), JSON.stringify(init));

    const toolList = await mcpRequest("tools/list");
    const tools = toolList?.result?.tools ?? [];
    const toolNames = tools.map((t: any) => t.name);
    push(
      "mcp tools",
      toolNames.includes("run_action") &&
        toolNames.includes("run_template") &&
        toolNames.includes("create_template") &&
        toolNames.includes("update_template") &&
        toolNames.includes("delete_template"),
      JSON.stringify(toolNames),
    );

    const mcpAction = await mcpRequest("tools/call", {
      name: "run_action",
      arguments: { action_id: singleActionId, variables: { topic: "gamma" } },
    });
    const mcpActionText = mcpAction?.result?.content?.[0]?.text ?? "";
    push("mcp run_action", mcpActionText.includes("NEW gamma"), mcpActionText);

    const mcpTemplate = await mcpRequest("tools/call", {
      name: "run_template",
      arguments: { template_id: sequentialTemplateId, variables: { topic: "delta" } },
    });
    const mcpTemplateText = mcpTemplate?.result?.content?.[0]?.text ?? "";
    push(
      "mcp run_template",
      mcpTemplateText.includes('"executionMode": "sequential"'),
      mcpTemplateText,
    );

    const oldTemplateParam = await api("/v1/chat/completions", {
      method: "POST",
      auth: "key",
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        template_id: sequentialTemplateId,
        messages: [{ role: "user", content: "plain old param check" }],
        stream: false,
      }),
    });
    const oldTemplateOk =
      oldTemplateParam.res.status === 200
        ? String(oldTemplateParam.body?.choices?.[0]?.message?.content ?? "").includes(
            "plain old param check",
          )
        : oldTemplateParam.res.status === 400;
    push(
      "chat old template_id",
      oldTemplateOk,
      JSON.stringify({
        status: oldTemplateParam.res.status,
        body: oldTemplateParam.body,
      }),
    );

    const summary = {
      email,
      projectId,
      singleActionId,
      singleActionVersion2Id,
      sequentialTemplateId,
      fanoutTemplateId,
      singleTraceId,
      sequentialTraceIds,
      fanoutTraceIds,
      results,
    };
    console.log(JSON.stringify(summary, null, 2));

    const failed = results.filter((r) => !r.ok);
    process.exitCode = failed.length ? 1 : 0;
  } finally {
    await providerFixture.rollback().catch(() => {});
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    }).catch(() => {});
    await prisma.$disconnect();
  }
}

run().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
