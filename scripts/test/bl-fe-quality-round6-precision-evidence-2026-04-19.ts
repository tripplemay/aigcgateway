import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3099";
const OUT =
  process.env.OUTPUT_FILE ??
  "docs/test-reports/perf-raw/bl-fe-quality-round6-precision-evidence-2026-04-19.json";
const MOCK_PORT = Number(process.env.MOCK_PORT ?? "3312");
const MOCK_BASE = `http://127.0.0.1:${MOCK_PORT}/v1`;
const DB_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://test:test@localhost:5432/aigc_gateway_test";
const ADMIN_PASSWORD = process.env.ADMIN_TEST_PASSWORD ?? "Codex@2026!";

const prisma = new PrismaClient({ datasourceUrl: DB_URL });

type ApiResult = { status: number; body: any; text: string };

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function extractPrompt(body: any): string {
  const lastUser = [...(body?.messages ?? [])].reverse().find((m: any) => m?.role === "user");
  return String(lastUser?.content ?? "");
}

async function startMockServer() {
  const server = createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/v1/chat/completions") {
      json(res, 404, { error: "not_found" });
      return;
    }
    const bodyText = await readBody(req);
    const body = JSON.parse(bodyText || "{}");
    const prompt = extractPrompt(body);
    const out = `ROUND6_MOCK(${prompt.slice(0, 120)})`;
    json(res, 200, {
      id: "chatcmpl-round6-mock",
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: body.model ?? "openai/gpt-4o-mini",
      choices: [{ index: 0, message: { role: "assistant", content: out }, finish_reason: "stop" }],
      usage: { prompt_tokens: 19, completion_tokens: 11, total_tokens: 30 },
    });
  });

  await new Promise<void>((resolve) => server.listen(MOCK_PORT, "127.0.0.1", () => resolve()));
  return server;
}

async function api(pathname: string, init?: RequestInit & { expect?: number | number[] }) {
  const { expect, ...rest } = init ?? {};
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(rest.headers as Record<string, string> | undefined),
  };
  const res = await fetch(`${BASE}${pathname}`, { ...rest, headers, redirect: "manual" });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (expect !== undefined) {
    const expects = Array.isArray(expect) ? expect : [expect];
    if (!expects.includes(res.status)) {
      throw new Error(`${pathname} expected ${expects.join("/")}, got ${res.status}: ${text}`);
    }
  }
  return { status: res.status, body, text } as ApiResult;
}

async function loginAdmin() {
  const candidates = [
    { email: "admin@aigc-gateway.local", password: ADMIN_PASSWORD },
    { email: "codex-admin@aigc-gateway.local", password: ADMIN_PASSWORD },
  ];
  for (const c of candidates) {
    const r = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: c.email, password: c.password }),
    });
    if (r.status === 200 && r.body?.token) return { email: c.email, token: String(r.body.token) };
  }
  throw new Error("admin login failed");
}

function nowTag() {
  return Date.now().toString(36);
}

async function createProject(token: string, name: string) {
  const r = await api("/api/projects", {
    method: "POST",
    expect: 201,
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name }),
  });
  return String(r.body?.id ?? "");
}

async function createAction(
  token: string,
  projectId: string,
  model: string,
  name: string,
  prompt: string,
  variables: Array<{ name: string; required?: boolean }>,
) {
  const r = await api(`/api/projects/${projectId}/actions`, {
    method: "POST",
    expect: 201,
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name,
      description: `${name} desc`,
      model,
      messages: [{ role: "user", content: prompt }],
      variables,
      changelog: "init",
    }),
  });
  return String(r.body?.id ?? "");
}

async function createTemplate(
  token: string,
  projectId: string,
  name: string,
  steps: Array<{ actionId: string; order: number; role?: string }>,
) {
  const r = await api(`/api/projects/${projectId}/templates`, {
    method: "POST",
    expect: 201,
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name, description: `${name} desc`, steps }),
  });
  return String(r.body?.id ?? "");
}

async function configureLocalProvider() {
  const aliasWithLink = await prisma.modelAlias.findFirst({
    where: {
      enabled: true,
      modality: "TEXT",
      models: { some: {} },
    },
    include: {
      models: {
        include: { model: true },
        orderBy: { id: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  let model = aliasWithLink?.models[0]?.model ?? null;
  let aliasName = aliasWithLink?.alias ?? null;

  if (!model) {
    model =
      (await prisma.model.findFirst({ where: { name: "openai/gpt-4o-mini" } })) ??
      (await prisma.model.findFirst({ orderBy: { createdAt: "asc" } }));
    aliasName = null;
  }
  if (!model) throw new Error("no model in DB for fixture");

  const channels = await prisma.channel.findMany({
    where: { modelId: model.id },
    include: { provider: true },
    orderBy: { createdAt: "asc" },
  });
  if (!channels.length) throw new Error(`no channel for model ${model.name}`);

  const chosen = channels[0];
  const siblings = channels.slice(1);

  const restore = {
    modelId: model.id,
    modelEnabled: model.enabled,
    providerId: chosen.provider.id,
    providerBaseUrl: chosen.provider.baseUrl,
    providerAuthConfig: chosen.provider.authConfig,
    chosenChannelId: chosen.id,
    chosenChannelStatus: chosen.status,
    siblings: siblings.map((s) => ({ id: s.id, status: s.status })),
    modelName: model.name,
    actionModel: aliasName ?? model.name,
  };

  return {
    restore,
    modelName: model.name,
    actionModel: restore.actionModel,
    async apply() {
      if (!model.enabled) {
        await prisma.model.update({ where: { id: model.id }, data: { enabled: true } });
      }
      await prisma.provider.update({
        where: { id: chosen.provider.id },
        data: { baseUrl: MOCK_BASE, authConfig: { apiKey: "round6-mock-key" }, proxyUrl: null },
      });
      await prisma.channel.update({ where: { id: chosen.id }, data: { status: "ACTIVE" } });
      for (const s of siblings) {
        await prisma.channel.update({ where: { id: s.id }, data: { status: "DISABLED" } });
      }
    },
    async rollback() {
      await prisma.model
        .update({ where: { id: model.id }, data: { enabled: restore.modelEnabled } })
        .catch(() => {});
      await prisma.provider
        .update({
          where: { id: chosen.provider.id },
          data: { baseUrl: restore.providerBaseUrl, authConfig: restore.providerAuthConfig },
        })
        .catch(() => {});
      await prisma.channel
        .update({ where: { id: chosen.id }, data: { status: restore.chosenChannelStatus } })
        .catch(() => {});
      for (const s of restore.siblings) {
        await prisma.channel.update({ where: { id: s.id }, data: { status: s.status } }).catch(() => {});
      }
    },
  };
}

async function run() {
  const fixture = await configureLocalProvider();
  const mock = await startMockServer();

  const evidence: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE,
    dbUrl: DB_URL,
    pass: false,
  };

  try {
    await fixture.apply();
    const admin = await loginAdmin();
    const tag = nowTag();
    const projectId = await createProject(admin.token, `BLFQ-R6-${tag}`);
    const startedAt = new Date();

    const actionIds: string[] = [];
    const model = String(fixture.modelName);
    for (let i = 1; i <= 10; i++) {
      const actionId = await createAction(
        admin.token,
        projectId,
        model,
        `r6-step-${i}-${tag}`,
        `R6 step${i} input={{source_text}} prev={{previous_output}}`,
        [
          { name: "source_text", required: true },
          { name: "previous_output", required: false },
        ],
      );
      actionIds.push(actionId);
    }

    const templateId = await createTemplate(
      admin.token,
      projectId,
      `R6-TEMPLATE-${tag}`,
      actionIds.map((id, idx) => ({ actionId: id, order: idx + 1, role: "SEQUENTIAL" })),
    );

    const exec = await api(`/api/templates/${templateId}/test`, {
      method: "POST",
      expect: [200, 201],
      headers: { Authorization: `Bearer ${admin.token}` },
      body: JSON.stringify({
        mode: "execute",
        variables: { source_text: `round6-${tag}` },
      }),
    });

    const runData = exec.body?.data ?? {};
    const runId = String(runData.runId ?? "");
    const runTotalCost = Number(runData.totalCost ?? 0);
    const runStatus = String(runData.status ?? "");
    const stepCount = Array.isArray(runData.steps) ? runData.steps.length : 0;

    const logs = await prisma.callLog.findMany({
      where: {
        projectId,
        actionId: { in: actionIds },
        source: "api",
        createdAt: { gte: startedAt },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, traceId: true, actionId: true, sellPrice: true, createdAt: true, status: true },
    });

    const sumSellPrice = logs.reduce((acc, l) => acc + Number(l.sellPrice ?? 0), 0);
    const diff = Math.abs(runTotalCost - sumSellPrice);

    evidence.pass = runStatus === "success" && stepCount === 10 && logs.length === 10 && diff < 1e-12;
    evidence.check = {
      runId,
      templateId,
      projectId,
      runStatus,
      stepCount,
      logCount: logs.length,
      runTotalCost,
      sumSellPrice,
      diff,
      threshold: 1e-12,
    };
    evidence.logs = logs;
  } finally {
    await fixture.rollback().catch(() => {});
    await new Promise<void>((resolve) => mock.close(() => resolve())).catch(() => {});
    await prisma.$disconnect();
  }

  fs.writeFileSync(OUT, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
  if (!evidence.pass) process.exit(1);
}

void run();
