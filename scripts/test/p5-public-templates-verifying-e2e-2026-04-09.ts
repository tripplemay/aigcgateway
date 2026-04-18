import { readFileSync, writeFileSync } from "fs";
import { requireEnv } from "../lib/require-env";

const BASE = process.env.BASE_URL ?? "http://localhost:3099";
const MCP_URL = `${BASE}/mcp`;
const OUTPUT =
  process.env.OUTPUT_FILE ?? "docs/test-reports/p5-public-templates-verifying-e2e-2026-04-09.json";

type Step = { name: string; ok: boolean; detail: string };

type ApiResult = { status: number; body: any; text: string };

function nowTag() {
  return Date.now().toString(36);
}

function read(path: string) {
  return readFileSync(path, "utf8");
}

function countMatches(text: string, re: RegExp) {
  const m = text.match(re);
  return m ? m.length : 0;
}

async function api(path: string, init?: RequestInit & { expect?: number }): Promise<ApiResult> {
  const { expect, ...rest } = init ?? {};
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(rest.headers as Record<string, string> | undefined),
  };
  const res = await fetch(`${BASE}${path}`, { ...rest, headers, redirect: "manual" });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (typeof expect === "number" && res.status !== expect) {
    throw new Error(`${path} expected ${expect}, got ${res.status}: ${text}`);
  }
  return { status: res.status, body, text };
}

async function login(email: string, password: string) {
  const res = await api("/api/auth/login", {
    method: "POST",
    expect: 200,
    body: JSON.stringify({ email, password }),
  });
  return String(res.body?.token ?? "");
}

async function registerAndLoginUser(tag: string) {
  const email = `p5_${tag}@test.local`;
  const password = "P5_Test_1234";
  await api("/api/auth/register", {
    method: "POST",
    expect: 201,
    body: JSON.stringify({ email, password, name: `P5 User ${tag}` }),
  });
  const token = await login(email, password);
  if (!token) throw new Error("user token missing");
  return { email, token };
}

async function createProject(token: string, name: string) {
  const res = await api("/api/projects", {
    method: "POST",
    expect: 201,
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name }),
  });
  const id = String(res.body?.id ?? "");
  if (!id) throw new Error("project id missing");
  return id;
}

async function createAction(token: string, projectId: string, input: { name: string; content: string }) {
  const res = await api(`/api/projects/${projectId}/actions`, {
    method: "POST",
    expect: 201,
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: input.name,
      description: `${input.name} desc`,
      model: "openrouter/google/gemma-4-26b-a4b-it",
      messages: [{ role: "user", content: input.content }],
      variables: [],
      changelog: "init",
    }),
  });
  const id = String(res.body?.id ?? "");
  if (!id) throw new Error("action id missing");
  return id;
}

async function createTemplate(token: string, projectId: string, input: { name: string; actionIds: string[] }) {
  const steps = input.actionIds.map((actionId, i) => ({ order: i + 1, actionId, role: "SEQUENTIAL" }));
  const res = await api(`/api/projects/${projectId}/templates`, {
    method: "POST",
    expect: 201,
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: input.name,
      description: `${input.name} description`,
      steps,
    }),
  });
  const id = String(res.body?.id ?? "");
  if (!id) throw new Error("template id missing");
  return id;
}

async function createApiKey(token: string, projectId: string) {
  const res = await api(`/api/projects/${projectId}/keys`, {
    method: "POST",
    expect: 201,
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: "p5-evaluator-key" }),
  });
  const key = String(res.body?.key ?? "");
  if (!key) throw new Error("api key missing");
  return key;
}

async function rawMcp(apiKey: string, method: string, params?: Record<string, unknown>) {
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params: params ?? {} }),
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    const dataLine = text
      .split("\n")
      .find((line) => line.startsWith("data: "))
      ?.slice("data: ".length);
    if (dataLine) {
      try {
        body = JSON.parse(dataLine);
      } catch {
        body = text;
      }
    } else {
      body = text;
    }
  }
  return { status: res.status, body, text };
}

async function callMcpTool(apiKey: string, name: string, args: Record<string, unknown> = {}) {
  const rpc = await rawMcp(apiKey, "tools/call", { name, arguments: args });
  if (rpc.status >= 400) throw new Error(`tools/call ${name} http ${rpc.status}: ${rpc.text}`);
  if (rpc.body?.error) throw new Error(`tools/call ${name} rpc error: ${JSON.stringify(rpc.body.error)}`);
  const result = rpc.body?.result ?? rpc.body;
  if (result?.isError) throw new Error(`tools/call ${name} tool error: ${result?.content?.[0]?.text ?? "unknown"}`);
  return result;
}

function parseToolJson(result: any) {
  const text = String(result?.content?.[0]?.text ?? "");
  if (!text) throw new Error("empty tool content");
  return JSON.parse(text);
}

async function run() {
  const steps: Step[] = [];

  try {
    const tag = nowTag();
    const adminToken = await login("admin@aigc-gateway.local", requireEnv("ADMIN_TEST_PASSWORD"));
    if (!adminToken) throw new Error("admin token missing");

    const user = await registerAndLoginUser(tag);
    const userToken = user.token;

    const adminProjectId = await createProject(adminToken, `P5 Admin Source ${tag}`);
    const userProjectId = await createProject(userToken, `P5 User Target ${tag}`);

    const actionA = await createAction(adminToken, adminProjectId, {
      name: `p5-src-action-a-${tag}`,
      content: "step-a",
    });
    const actionB = await createAction(adminToken, adminProjectId, {
      name: `p5-src-action-b-${tag}`,
      content: "step-b",
    });
    const sourceTemplateId = await createTemplate(adminToken, adminProjectId, {
      name: `P5 Source Public ${tag}`,
      actionIds: [actionA, actionB],
    });
    const privateTemplateId = await createTemplate(adminToken, adminProjectId, {
      name: `P5 Source Private ${tag}`,
      actionIds: [actionA],
    });

    await api(`/api/admin/templates/${sourceTemplateId}`, {
      method: "PATCH",
      expect: 200,
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ isPublic: true, qualityScore: 88 }),
    });

    // AC1: public list/detail/fork chain
    const listRes = await api(`/api/templates/public?search=${encodeURIComponent(`P5 Source Public ${tag}`)}`, {
      expect: 200,
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const found = Array.isArray(listRes.body?.data)
      ? listRes.body.data.find((t: any) => t.id === sourceTemplateId)
      : null;

    const detailRes = await api(`/api/templates/public/${sourceTemplateId}`, {
      expect: 200,
      headers: { Authorization: `Bearer ${userToken}` },
    });

    const forkRes = await api(`/api/projects/${userProjectId}/templates/fork`, {
      method: "POST",
      expect: 201,
      headers: { Authorization: `Bearer ${userToken}` },
      body: JSON.stringify({ sourceTemplateId }),
    });
    const forkedTemplateId = String(forkRes.body?.template?.id ?? "");

    const chainOk = Boolean(found) && detailRes.body?.id === sourceTemplateId && Boolean(forkedTemplateId);
    steps.push({
      name: "AC1 public template list/detail/fork chain",
      ok: chainOk,
      detail: `found=${Boolean(found)}, detailId=${detailRes.body?.id}, forked=${forkedTemplateId || "none"}`,
    });

    // AC2: deep copy integrity
    const forkedDetail = await api(`/api/projects/${userProjectId}/templates/${forkedTemplateId}`, {
      expect: 200,
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const userActions = await api(`/api/projects/${userProjectId}/actions?page=1&pageSize=100`, {
      expect: 200,
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const userActionIds = new Set((userActions.body?.data ?? []).map((a: any) => a.id));
    const sourceActionIds = new Set([actionA, actionB]);
    const forkedSteps: any[] = forkedDetail.body?.steps ?? [];
    const forkedActionIds = new Set(forkedSteps.map((s) => s.actionId));

    const deepCopyOk =
      forkedDetail.body?.sourceTemplateId === sourceTemplateId &&
      forkedSteps.length === (detailRes.body?.steps?.length ?? -1) &&
      [...forkedActionIds].every((id) => userActionIds.has(String(id))) &&
      [...forkedActionIds].every((id) => !sourceActionIds.has(String(id)));
    steps.push({
      name: "AC2 fork deep copy integrity (Template+Steps+Actions)",
      ok: deepCopyOk,
      detail: `sourceTemplateId=${forkedDetail.body?.sourceTemplateId}, forkedSteps=${forkedSteps.length}, sourceSteps=${detailRes.body?.steps?.length ?? 0}, forkedActionIds=${[...forkedActionIds].join(",")}`,
    });

    // AC3: private template must return 404 when forking
    const privateFork = await api(`/api/projects/${userProjectId}/templates/fork`, {
      method: "POST",
      expect: 404,
      headers: { Authorization: `Bearer ${userToken}` },
      body: JSON.stringify({ sourceTemplateId: privateTemplateId }),
    });
    steps.push({
      name: "AC3 non-public template cannot be forked",
      ok: privateFork.status === 404,
      detail: `status=${privateFork.status}, code=${privateFork.body?.error?.code ?? "none"}`,
    });

    // AC4: MCP tools
    const apiKey = await createApiKey(userToken, userProjectId);
    const init = await rawMcp(apiKey, "initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "codex-p5-verifier", version: "1.0.0" },
    });
    const toolsList = await rawMcp(apiKey, "tools/list");
    const tools = toolsList.body?.result?.tools ?? [];
    const hasListPublic = tools.some((t: any) => t?.name === "list_public_templates");
    const hasForkPublic = tools.some((t: any) => t?.name === "fork_public_template");
    const listTool = parseToolJson(await callMcpTool(apiKey, "list_public_templates", { search: `P5 Source Public ${tag}` }));
    const forkTool = parseToolJson(await callMcpTool(apiKey, "fork_public_template", { templateId: sourceTemplateId }));
    const mcpOk =
      init.status === 200 &&
      hasListPublic &&
      hasForkPublic &&
      Array.isArray(listTool.templates) &&
      listTool.templates.some((t: any) => t.id === sourceTemplateId) &&
      Boolean(forkTool.forkedTemplate?.id);
    steps.push({
      name: "AC4 MCP tools list_public_templates + fork_public_template",
      ok: mcpOk,
      detail: `init=${init.status}, hasListPublic=${hasListPublic}, hasForkPublic=${hasForkPublic}, listCount=${listTool.templates?.length ?? 0}, forked=${forkTool.forkedTemplate?.id ?? "none"}`,
    });

    // AC5: UI structure spot checks (tab + library blocks)
    const templatesPage = read("src/app/(console)/templates/page.tsx");
    const globalLibrary = read("src/app/(console)/templates/global-library.tsx");
    const detailDrawer = read("src/app/(console)/templates/template-detail-drawer.tsx");
    const forkDialog = read("src/app/(console)/templates/fork-confirm-dialog.tsx");
    const uiStructureOk =
      templatesPage.includes('TabsTrigger value="my"') &&
      templatesPage.includes('TabsTrigger value="library"') &&
      templatesPage.includes("<GlobalLibrary />") &&
      globalLibrary.includes("grid grid-cols-1 lg:grid-cols-3") &&
      globalLibrary.includes("TemplateDetailDrawer") &&
      globalLibrary.includes("ForkConfirmDialog") &&
      detailDrawer.includes("executionPipeline") &&
      forkDialog.includes("forkDialogTitle");
    steps.push({
      name: "AC5 UI structure spot checks (tab + grid + drawer + dialog)",
      ok: uiStructureOk,
      detail: `tabs=${templatesPage.includes('TabsTrigger value=\"my\"') && templatesPage.includes('TabsTrigger value=\"library\"')}, grid3col=${globalLibrary.includes("grid grid-cols-1 lg:grid-cols-3")}`,
    });

    // AC6: DS token consistency (legacy + hardcoded color classes)
    const uiAll = [templatesPage, globalLibrary, detailDrawer, forkDialog].join("\n");
    const legacyCount =
      countMatches(uiAll, /\bbg-card\b/g) +
      countMatches(uiAll, /\bbg-muted\b/g) +
      countMatches(uiAll, /\btext-muted-foreground\b/g) +
      countMatches(uiAll, /\bbg-background\b/g);
    const hardcodedColorCount =
      countMatches(uiAll, /\b(bg|text|border)-(slate|gray|zinc|neutral|indigo|orange|green|red|amber)-[0-9]{2,3}\b/g) +
      countMatches(uiAll, /\b(bg|text)-\[#/g) +
      countMatches(uiAll, /#[0-9A-Fa-f]{3,8}/g);
    const dsOk = legacyCount === 0 && hardcodedColorCount === 0;
    steps.push({
      name: "AC6 DS token audit (zero legacy token and zero hardcoded color)",
      ok: dsOk,
      detail: `legacy=${legacyCount}, hardcodedColor=${hardcodedColorCount}`,
    });

    // AC7: i18n coverage / hardcoded residues
    const msgEn = read("src/messages/en.json");
    const msgZh = read("src/messages/zh-CN.json");
    const i18nKeysOk =
      msgEn.includes('"tabGlobalLibrary"') &&
      msgZh.includes('"tabGlobalLibrary"') &&
      msgEn.includes('"forkDialogTitle"') &&
      msgZh.includes('"forkDialogTitle"') &&
      msgEn.includes('"actionsWillBeCopied"') &&
      msgZh.includes('"actionsWillBeCopied"');
    const hardcodedResidues = [
      templatesPage.includes("Total Public Templates") ? "templates.page.total-public-hardcoded" : "",
      templatesPage.includes("Most Forked") ? "templates.page.most-forked-hardcoded" : "",
      templatesPage.includes("to-indigo-800") ? "templates.page.indigo-palette-hardcoded" : "",
      globalLibrary.includes("Score: {score}") ? "global-library.score-prefix" : "",
      detailDrawer.includes("Score: {template.qualityScore}") ? "detail-drawer.score-prefix" : "",
      detailDrawer.includes("{labels[mode] ?? mode} Mode") ? "detail-drawer.mode-suffix" : "",
      detailDrawer.includes("Step {String(i + 1).padStart(2, \"0\")}") ? "detail-drawer.step-prefix" : "",
    ].filter(Boolean);
    const i18nOk = i18nKeysOk && hardcodedResidues.length === 0;
    steps.push({
      name: "AC7 i18n audit (key coverage + no known hardcoded residues)",
      ok: i18nOk,
      detail: `keys=${i18nKeysOk}, hardcoded=${hardcodedResidues.join("|") || "none"}`,
    });

    const passCount = steps.filter((s) => s.ok).length;
    const failCount = steps.length - passCount;
    writeFileSync(
      OUTPUT,
      JSON.stringify(
        {
          baseUrl: BASE,
          passCount,
          failCount,
          context: { adminProjectId, userProjectId, sourceTemplateId, privateTemplateId },
          steps,
        },
        null,
        2,
      ),
    );
    if (failCount > 0) {
      console.error(`[p5-public-templates-verifying] failed: ${failCount} step(s) failed`);
      process.exit(1);
    }
  } catch (err) {
    const detail = err instanceof Error ? err.stack ?? err.message : String(err);
    writeFileSync(
      OUTPUT,
      JSON.stringify(
        {
          baseUrl: BASE,
          passCount: 0,
          failCount: 1,
          steps: [{ name: "script runtime", ok: false, detail }],
        },
        null,
        2,
      ),
    );
    console.error(`[p5-public-templates-verifying] script error: ${detail}`);
    process.exit(1);
  }
}

void run();
