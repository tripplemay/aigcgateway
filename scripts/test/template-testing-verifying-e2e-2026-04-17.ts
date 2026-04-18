import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { PrismaClient } from "@prisma/client";
import { readFileSync, existsSync } from "fs";
import { requireEnv } from "../lib/require-env";

// Pin the Prisma client to the same DB the server on :3099 is using. Without
// this, @prisma/client auto-loads .env (dev DATABASE_URL = aigc_gateway)
// whenever scripts/test/codex-env.sh is not sourced in the shell running the
// verifier — the fixture then mocks providers in the dev DB, but the server
// (configured via codex-env to aigc_gateway_test) looks up a different DB and
// cannot find the model the Action references, so execute mode 100% throws
// MODEL_NOT_FOUND on machines where dev DB has seeded aliases/models.
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://test:test@localhost:5432/aigc_gateway_test";
const prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });

const BASE = process.env.BASE_URL ?? "http://localhost:3099";
const OUTPUT =
  process.env.OUTPUT_FILE ??
  "docs/test-reports/template-testing-verifying-local-e2e-2026-04-17.json";

const MCP_PATH = process.env.MCP_PATH ?? "/mcp";
const MCP_FALLBACK_PATH = process.env.MCP_FALLBACK_PATH ?? "/api/mcp";

const TEST_RUN_POST_PATHS = [
  process.env.TEMPLATE_TEST_POST_PATH,
  "/api/templates/{templateId}/test",
  "/api/projects/{projectId}/templates/{templateId}/test",
].filter(Boolean) as string[];

const TEST_RUN_LIST_PATHS = [
  process.env.TEMPLATE_TEST_LIST_PATH,
  "/api/templates/{templateId}/test-runs",
  "/api/projects/{projectId}/templates/{templateId}/test-runs",
].filter(Boolean) as string[];

const TEST_RUN_DETAIL_PATHS = [
  process.env.TEMPLATE_TEST_DETAIL_PATH,
  "/api/templates/{templateId}/test-runs/{runId}",
  "/api/projects/{projectId}/templates/{templateId}/test-runs/{runId}",
].filter(Boolean) as string[];

const MOCK_PORT = Number(process.env.MOCK_PORT ?? "3311");
const MOCK_BASE = `http://127.0.0.1:${MOCK_PORT}/v1`;

const ADMIN_CANDIDATES = [
  {
    email: process.env.ADMIN_EMAIL ?? "admin@aigc-gateway.local",
    password: requireEnv("ADMIN_TEST_PASSWORD"),
  },
  { email: "codex-admin@aigc-gateway.local", password: requireEnv("ADMIN_TEST_PASSWORD") },
];

type Step = { id: string; ok: boolean; detail: string };
type ApiResult = { status: number; body: any; text: string };

type RunView = {
  id?: string;
  mode?: string;
  status?: string;
  variables?: Record<string, unknown>;
  steps: any[];
  totalTokens?: number | null;
  totalCost?: number | null;
  totalLatency?: number | null;
  raw: any;
};

function nowTag() {
  return Date.now().toString(36);
}

function errText(err: unknown): string {
  if (err instanceof Error) return err.stack ?? err.message;
  return String(err);
}

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function stringify(obj: unknown) {
  try {
    return JSON.stringify(obj);
  } catch {
    return String(obj);
  }
}

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

function mockOutputForPrompt(prompt: string): string {
  return `MOCK_OUT(${prompt.trim()})`;
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
    const output = mockOutputForPrompt(prompt);

    json(res, 200, {
      id: "chatcmpl-mock-tt",
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: body.model ?? "openai/gpt-4o-mini",
      choices: [
        { index: 0, message: { role: "assistant", content: output }, finish_reason: "stop" },
      ],
      usage: { prompt_tokens: 17, completion_tokens: 9, total_tokens: 26 },
    });
  });

  await new Promise<void>((resolve) => server.listen(MOCK_PORT, "127.0.0.1", () => resolve()));
  return server;
}

async function api(
  pathname: string,
  init?: RequestInit & { expect?: number | number[] },
): Promise<ApiResult> {
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

  return { status: res.status, body, text };
}

async function login(email: string, password: string): Promise<string> {
  const r = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (r.status !== 200) return "";
  return String(r.body?.token ?? "");
}

async function loginAdmin(): Promise<{ email: string; token: string }> {
  for (const c of ADMIN_CANDIDATES) {
    const token = await login(c.email, c.password);
    if (token) return { email: c.email, token };
  }
  throw new Error("admin login failed for all candidates");
}

async function registerAndLoginUser(
  tag: string,
  prefix: string,
): Promise<{ email: string; token: string }> {
  const email = `${prefix}_${tag}@test.local`;
  const password = "TT_Test_1234";

  await api("/api/auth/register", {
    method: "POST",
    expect: [200, 201, 409],
    body: JSON.stringify({ email, password, name: `${prefix}-${tag}` }),
  });

  const token = await login(email, password);
  if (!token) throw new Error(`login failed for ${email}`);

  return { email, token };
}

async function createProject(token: string, name: string): Promise<string> {
  const r = await api("/api/projects", {
    method: "POST",
    expect: 201,
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name }),
  });
  const id = String(r.body?.id ?? "");
  if (!id) throw new Error("project id missing");
  return id;
}

async function createAction(
  token: string,
  projectId: string,
  input: {
    name: string;
    model: string;
    prompt: string;
    variables: Array<{
      name: string;
      description?: string;
      required?: boolean;
      defaultValue?: string;
    }>;
  },
): Promise<string> {
  const r = await api(`/api/projects/${projectId}/actions`, {
    method: "POST",
    expect: 201,
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: input.name,
      description: `${input.name} description`,
      model: input.model,
      messages: [{ role: "user", content: input.prompt }],
      variables: input.variables,
      changelog: "init",
    }),
  });

  const id = String(r.body?.id ?? "");
  if (!id) throw new Error("action id missing");
  return id;
}

async function createTemplate(
  token: string,
  projectId: string,
  name: string,
  steps: Array<{ actionId: string; order: number; role?: string }>,
): Promise<string> {
  const r = await api(`/api/projects/${projectId}/templates`, {
    method: "POST",
    expect: 201,
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name, description: `${name} description`, steps }),
  });
  const id = String(r.body?.id ?? "");
  if (!id) throw new Error("template id missing");
  return id;
}

async function createApiKey(token: string, projectId: string, name: string): Promise<string> {
  const tries = [
    { path: "/api/keys", body: { name } },
    { path: `/api/projects/${projectId}/keys`, body: { name } },
  ];

  let lastErr = "";
  for (const t of tries) {
    try {
      const r = await api(t.path, {
        method: "POST",
        expect: 201,
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(t.body),
      });
      const key = String(r.body?.key ?? "");
      if (!key) throw new Error(`api key missing from ${t.path}`);
      return key;
    } catch (err) {
      lastErr = `${t.path}: ${errText(err)}`;
    }
  }

  throw new Error(`create api key failed: ${lastErr}`);
}

async function setTemplatePublic(token: string, templateId: string): Promise<void> {
  await api(`/api/admin/templates/${templateId}`, {
    method: "PATCH",
    expect: [200, 204],
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ isPublic: true, category: "other" }),
  });
}

function fillPath(pattern: string, vars: Record<string, string>) {
  let out = pattern;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{${k}}`).join(encodeURIComponent(v));
  }
  return out;
}

function parseRun(body: any): RunView {
  const root = body?.data ?? body?.run ?? body;
  const steps = Array.isArray(root?.steps)
    ? root.steps
    : Array.isArray(root?.result?.steps)
      ? root.result.steps
      : [];

  return {
    id: root?.id ? String(root.id) : undefined,
    mode: root?.mode ? String(root.mode) : undefined,
    status: root?.status ? String(root.status) : undefined,
    variables: (root?.variables ?? {}) as Record<string, unknown>,
    steps,
    totalTokens: toNum(root?.totalTokens ?? root?.total_tokens),
    totalCost: toNum(root?.totalCost ?? root?.total_cost),
    totalLatency: toNum(root?.totalLatency ?? root?.total_latency),
    raw: root,
  };
}

async function postTemplateTest(
  token: string,
  projectId: string,
  templateId: string,
  mode: "dry_run" | "execute",
  variables: Record<string, unknown>,
) {
  let lastErr = "";
  for (const p of TEST_RUN_POST_PATHS) {
    const path = fillPath(p, { projectId, templateId });
    try {
      const r = await api(path, {
        method: "POST",
        expect: [200, 201],
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mode, variables }),
      });
      return { path, result: parseRun(r.body), status: r.status, body: r.body };
    } catch (err) {
      lastErr = `${path}: ${errText(err)}`;
    }
  }
  throw new Error(`template test POST failed: ${lastErr}`);
}

async function listTemplateRuns(token: string, projectId: string, templateId: string) {
  let lastErr = "";
  for (const p of TEST_RUN_LIST_PATHS) {
    const path = fillPath(p, { projectId, templateId });
    try {
      const r = await api(path, {
        expect: 200,
        headers: { Authorization: `Bearer ${token}` },
      });
      const rows = Array.isArray(r.body?.data)
        ? r.body.data
        : Array.isArray(r.body?.runs)
          ? r.body.runs
          : Array.isArray(r.body)
            ? r.body
            : [];
      return { path, rows };
    } catch (err) {
      lastErr = `${path}: ${errText(err)}`;
    }
  }
  throw new Error(`template test-runs list failed: ${lastErr}`);
}

async function getTemplateRunDetail(
  token: string,
  projectId: string,
  templateId: string,
  runId: string,
) {
  let lastErr = "";
  for (const p of TEST_RUN_DETAIL_PATHS) {
    const path = fillPath(p, { projectId, templateId, runId });
    try {
      const r = await api(path, {
        expect: 200,
        headers: { Authorization: `Bearer ${token}` },
      });
      return { path, result: parseRun(r.body), body: r.body };
    } catch (err) {
      lastErr = `${path}: ${errText(err)}`;
    }
  }
  throw new Error(`template test-runs detail failed: ${lastErr}`);
}

async function tryPostTemplateTestExpectDenied(
  token: string,
  projectId: string,
  templateId: string,
) {
  const denied = new Set([401, 403, 404]);
  for (const p of TEST_RUN_POST_PATHS) {
    const path = fillPath(p, { projectId, templateId });
    const r = await api(path, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ mode: "dry_run", variables: { probe: "x" } }),
    });
    if (denied.has(r.status)) return { ok: true, path, status: r.status };
  }
  return { ok: false, path: "none", status: -1 };
}

function parseSseEvents(text: string): any[] {
  return text
    .split("\n\n")
    .map((x) => x.trim())
    .filter(Boolean)
    .flatMap((block) => {
      const line = block.split("\n").find((l) => l.startsWith("data: "));
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

async function rawMcp(
  apiKey: string,
  method: string,
  params?: Record<string, unknown>,
  fallback = false,
) {
  const path = fallback ? MCP_FALLBACK_PATH : MCP_PATH;
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params: params ?? {} }),
  });
  const text = await r.text();

  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    const events = parseSseEvents(text);
    body = events.at(-1) ?? text;
  }

  return { status: r.status, text, body, path };
}

async function rawMcpWithFallback(
  apiKey: string,
  method: string,
  params?: Record<string, unknown>,
) {
  const primary = await rawMcp(apiKey, method, params, false);
  if (primary.status !== 404) return primary;
  return rawMcp(apiKey, method, params, true);
}

async function callMcpTool(apiKey: string, name: string, args: Record<string, unknown>) {
  const rpc = await rawMcpWithFallback(apiKey, "tools/call", { name, arguments: args });
  if (rpc.status >= 400) throw new Error(`MCP tool ${name} http ${rpc.status}: ${rpc.text}`);
  if (rpc.body?.error) throw new Error(`MCP tool ${name} rpc error: ${stringify(rpc.body.error)}`);
  const result = rpc.body?.result ?? rpc.body;
  if (result?.isError) throw new Error(`MCP tool ${name} returned isError`);
  return { rpc, result };
}

function parseMcpToolJson(result: any) {
  const text = String(result?.content?.[0]?.text ?? "");
  if (!text) throw new Error("MCP tool content empty");
  return JSON.parse(text);
}

async function configureLocalProvider() {
  // Prefer an enabled text alias linked to a model that has channels.
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
  if (!model) throw new Error("no model available in DB for provider fixture");

  const channels = await prisma.channel.findMany({
    where: { modelId: model.id },
    include: { provider: true },
    orderBy: { createdAt: "asc" },
  });
  if (!channels.length) throw new Error(`no channel found for model ${model.name}`);

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
        data: { baseUrl: MOCK_BASE, authConfig: { apiKey: "mock-provider-key" }, proxyUrl: null },
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
        await prisma.channel
          .update({ where: { id: s.id }, data: { status: s.status } })
          .catch(() => {});
      }
    },
  };
}

function checkContains(text: string, patterns: RegExp[]) {
  return patterns.every((p) => p.test(text));
}

async function run() {
  const steps: Step[] = [];
  const context: Record<string, unknown> = {};

  const push = (id: string, ok: boolean, detail: string) => steps.push({ id, ok, detail });

  const mock = await startMockServer();
  const fixture = await configureLocalProvider();

  try {
    await fixture.apply();

    const tag = nowTag();
    const admin = await loginAdmin();
    const u1 = await registerAndLoginUser(tag, "tt1");
    const u2 = await registerAndLoginUser(tag, "tt2");

    const adminProjectId = await createProject(admin.token, `TT Admin ${tag}`);
    const u1ProjectId = await createProject(u1.token, `TT User1 ${tag}`);
    const u2ProjectId = await createProject(u2.token, `TT User2 ${tag}`);

    const u1Project = await prisma.project.findUnique({
      where: { id: u1ProjectId },
      select: { userId: true },
    });
    const u2Project = await prisma.project.findUnique({
      where: { id: u2ProjectId },
      select: { userId: true },
    });
    if (u1Project?.userId)
      await prisma.user.update({ where: { id: u1Project.userId }, data: { balance: 100 } });
    if (u2Project?.userId)
      await prisma.user.update({ where: { id: u2Project.userId }, data: { balance: 100 } });

    context.adminEmail = admin.email;
    context.user1 = u1.email;
    context.user2 = u2.email;
    context.model = fixture.modelName;
    context.actionModel = fixture.actionModel;
    context.projects = { adminProjectId, u1ProjectId, u2ProjectId };

    const model = String(fixture.modelName);
    const validAction = await createAction(u1.token, u1ProjectId, {
      name: `tt-valid-${tag}`,
      model,
      prompt: "Translate {{source_text}} to {{target_language}}",
      variables: [
        { name: "source_text", description: "source text", required: true },
        { name: "target_language", description: "target", required: true },
      ],
    });

    const failingAction = await createAction(u1.token, u1ProjectId, {
      name: `tt-fail-${tag}`,
      model: "openai/non-existent-model",
      prompt: "Will fail after {{previous_output}}",
      variables: [{ name: "previous_output", description: "previous", required: true }],
    });

    const templateOk = await createTemplate(u1.token, u1ProjectId, `TT OK ${tag}`, [
      { actionId: validAction, order: 1, role: "SEQUENTIAL" },
    ]);

    const templatePartial = await createTemplate(u1.token, u1ProjectId, `TT PARTIAL ${tag}`, [
      { actionId: validAction, order: 1, role: "SEQUENTIAL" },
      { actionId: failingAction, order: 2, role: "SEQUENTIAL" },
    ]);

    context.templates = { templateOk, templatePartial };

    // AC1 dry_run
    const dry = await postTemplateTest(u1.token, u1ProjectId, templateOk, "dry_run", {
      source_text: "Hello world",
      target_language: "Chinese",
    });
    const dryInput = stringify(dry.result.steps);
    const dryCost = dry.result.totalCost;
    const dryOk =
      /Hello world/.test(dryInput) &&
      (dryCost === 0 || dryCost === null || dryCost === undefined || Math.abs(dryCost) < 1e-9);
    push(
      "AC1-dry-run-rendered-input-cost-zero",
      dryOk,
      `path=${dry.path} mode=${dry.result.mode ?? "na"} status=${dry.result.status ?? "na"} steps=${dry.result.steps.length} totalCost=${String(dryCost)}`,
    );

    // AC2 execute success
    const exe = await postTemplateTest(u1.token, u1ProjectId, templateOk, "execute", {
      source_text: "Execute flow",
      target_language: "Chinese",
    });
    const exeOutput = stringify(exe.result.steps);
    const exeOk =
      (exe.result.status === "success" || exe.result.status === "partial") &&
      exe.result.steps.length >= 1 &&
      /output|MOCK_OUT|usage|tokens/i.test(exeOutput);
    push(
      "AC2-execute-real-step-results",
      exeOk,
      `path=${exe.path} status=${exe.result.status ?? "na"} steps=${exe.result.steps.length} totalTokens=${String(exe.result.totalTokens)}`,
    );

    // AC3 partial status
    const partial = await postTemplateTest(u1.token, u1ProjectId, templatePartial, "execute", {
      source_text: "Partial case",
      target_language: "Chinese",
    });
    const partialStepText = stringify(partial.result.steps);
    const partialOk =
      partial.result.status === "partial" &&
      partial.result.steps.length >= 1 &&
      /MOCK_OUT|output/i.test(partialStepText);
    push(
      "AC3-partial-preserve-executed-steps",
      partialOk,
      `path=${partial.path} status=${partial.result.status ?? "na"} steps=${partial.result.steps.length}`,
    );

    // AC4 history cleanup to 20
    for (let i = 0; i < 22; i++) {
      await postTemplateTest(u1.token, u1ProjectId, templateOk, "dry_run", {
        source_text: `history-${i}`,
        target_language: "Chinese",
      });
    }
    const listRuns = await listTemplateRuns(u1.token, u1ProjectId, templateOk);
    const cleanupOk = listRuns.rows.length <= 20;
    push(
      "AC4-test-runs-retention-20",
      cleanupOk,
      `path=${listRuns.path} count=${listRuns.rows.length}`,
    );

    // AC5 history preset readiness (API + source markers)
    const latestRunId = String(listRuns.rows[0]?.id ?? "");
    let detailOk = false;
    let detailPath = "n/a";
    if (latestRunId) {
      const detail = await getTemplateRunDetail(u1.token, u1ProjectId, templateOk, latestRunId);
      detailPath = detail.path;
      detailOk = Boolean(
        detail.result.variables && Object.keys(detail.result.variables).length > 0,
      );
    }

    const testPagePath = "src/app/(console)/templates/[templateId]/test/page.tsx";
    const testPageText = existsSync(testPagePath) ? readFileSync(testPagePath, "utf8") : "";
    const historyPresetMarkers =
      /history|test-runs|preset|load/i.test(testPageText) &&
      /variables|set.*variable|onChange/i.test(testPageText);

    push(
      "AC5-history-preset-load-readiness",
      detailOk && historyPresetMarkers,
      `detailPath=${detailPath} detailVariables=${detailOk} uiMarkers=${historyPresetMarkers}`,
    );

    // AC6 left/right layout structure
    const layoutOk =
      existsSync(testPagePath) &&
      checkContains(testPageText, [
        /PageContainer|page-container/i,
        /PageHeader|page-header/i,
        /SectionCard/i,
      ]) &&
      /left|right|grid-cols-|w-\[|basis-|split/i.test(testPageText);
    push(
      "AC6-test-page-left-right-layout",
      layoutOk,
      `fileExists=${existsSync(testPagePath)} markers=${layoutOk}`,
    );

    // AC7 MCP test_mode
    if (u1Project?.userId) {
      await prisma.user.update({ where: { id: u1Project.userId }, data: { balance: 100 } });
    }
    const key = await createApiKey(u1.token, u1ProjectId, `tt-mcp-${tag}`);
    const init = await rawMcpWithFallback(key, "initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "tt-verifier", version: "1.0.0" },
    });
    const tools = await rawMcpWithFallback(key, "tools/list", {});
    const runTpl = (tools.body?.result?.tools ?? []).find((x: any) => x?.name === "run_template");
    const props = runTpl?.inputSchema?.properties ?? runTpl?.inputSchema?.schema?.properties ?? {};
    const hasTestMode = Object.prototype.hasOwnProperty.call(props, "test_mode");

    let mcpOk = false;
    let mcpDetail = `mcpPath=${init.path} init=${init.status} hasTestMode=${hasTestMode}`;
    try {
      const mcpDry = parseMcpToolJson(
        (
          await callMcpTool(key, "run_template", {
            template_id: templateOk,
            variables: { source_text: "MCP Dry", target_language: "Chinese" },
            test_mode: "dry_run",
          })
        ).result,
      );

      const mcpExec = parseMcpToolJson(
        (
          await callMcpTool(key, "run_template", {
            template_id: templateOk,
            variables: { source_text: "MCP Exec", target_language: "Chinese" },
            test_mode: "execute",
          })
        ).result,
      );

      mcpOk =
        init.status === 200 &&
        hasTestMode &&
        Array.isArray(mcpDry?.steps) &&
        Array.isArray(mcpExec?.steps) &&
        mcpExec.steps.length > 0;
      mcpDetail = `${mcpDetail} drySteps=${mcpDry?.steps?.length ?? 0} execSteps=${mcpExec?.steps?.length ?? 0}`;
    } catch (err) {
      mcpDetail = `${mcpDetail} callError=${errText(err)}`;
    }

    push("AC7-mcp-run-template-test-mode", mcpOk, mcpDetail);

    // AC8 unforked public template cannot test
    const adminAction = await createAction(admin.token, adminProjectId, {
      name: `tt-admin-${tag}`,
      model,
      prompt: "admin {{x}}",
      variables: [{ name: "x", required: true }],
    });
    const adminTpl = await createTemplate(admin.token, adminProjectId, `TT ADMIN PUB ${tag}`, [
      { actionId: adminAction, order: 1, role: "SEQUENTIAL" },
    ]);
    await setTemplatePublic(admin.token, adminTpl);

    const deny = await tryPostTemplateTestExpectDenied(u2.token, u2ProjectId, adminTpl);
    push(
      "AC8-unforked-public-template-cannot-test",
      deny.ok,
      `path=${deny.path} status=${deny.status}`,
    );

    // AC9 global-library DS components + no handcrafted card styles
    const globalLibraryPath = "src/app/(console)/templates/global-library.tsx";
    const globalLibraryText = existsSync(globalLibraryPath)
      ? readFileSync(globalLibraryPath, "utf8")
      : "";

    const hasDsGlobal =
      /SectionCard/.test(globalLibraryText) &&
      /StatusChip/.test(globalLibraryText) &&
      /gradient-primary/.test(globalLibraryText);
    const noLegacyCardGlobal = !/(rounded-xl|shadow-sm|ring-1\b)/.test(globalLibraryText);
    push(
      "AC9-global-library-public-components-only",
      hasDsGlobal && noLegacyCardGlobal,
      `exists=${existsSync(globalLibraryPath)} ds=${hasDsGlobal} noLegacy=${noLegacyCardGlobal}`,
    );

    // AC10 test page DS components + no handcrafted styles
    const hasDsTestPage =
      /PageContainer|page-container/i.test(testPageText) &&
      /PageHeader|page-header/i.test(testPageText) &&
      /SectionCard/.test(testPageText);
    const noLegacyTestPage = !/(rounded-xl|shadow-sm|ring-1\b)/.test(testPageText);
    push(
      "AC10-test-page-public-components-only",
      hasDsTestPage && noLegacyTestPage,
      `exists=${existsSync(testPagePath)} ds=${hasDsTestPage} noLegacy=${noLegacyTestPage}`,
    );

    // AC11 grep handcrafted styles regression zero
    const grepTargets = [globalLibraryText, testPageText].join("\n");
    const deniedPatterns = [
      /\brounded-xl\b/g,
      /\bshadow-sm\b/g,
      /\bring-1\b/g,
      /\bbg-white\b/g,
      /\btext-indigo-\d{2,3}\b/g,
      /\bfrom-indigo-\d{2,3}\b/g,
    ];
    const deniedHitCount = deniedPatterns.reduce(
      (acc, re) => acc + (grepTargets.match(re) ?? []).length,
      0,
    );
    push(
      "AC11-grep-handwritten-card-button-zero",
      deniedHitCount === 0,
      `deniedHits=${deniedHitCount}`,
    );

    // AC12 evidence bundle
    const passCount = steps.filter((s) => s.ok).length;
    const failCount = steps.length - passCount;

    writeResult({
      batch: "TEMPLATE-TESTING",
      generatedAt: new Date().toISOString(),
      baseUrl: BASE,
      passCount,
      failCount,
      context,
      steps,
    });

    if (failCount > 0) {
      console.error(`[template-testing-verifying] failed: ${failCount} step(s)`);
      process.exit(1);
    }
  } catch (err) {
    writeResult({
      batch: "TEMPLATE-TESTING",
      generatedAt: new Date().toISOString(),
      baseUrl: BASE,
      passCount: 0,
      failCount: 1,
      steps: [{ id: "runtime", ok: false, detail: errText(err) }],
    });
    console.error(`[template-testing-verifying] runtime error: ${errText(err)}`);
    process.exit(1);
  } finally {
    await fixture.rollback().catch(() => {});
    await new Promise<void>((resolve) => mock.close(() => resolve())).catch(() => {});
    await prisma.$disconnect();
  }
}

function writeResult(payload: Record<string, unknown>) {
  const { writeFileSync } = require("fs") as typeof import("fs");
  writeFileSync(OUTPUT, JSON.stringify(payload, null, 2));
}

void run();
