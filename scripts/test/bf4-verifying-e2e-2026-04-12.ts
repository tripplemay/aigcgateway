import { readFileSync, writeFileSync } from "fs";
import { spawnSync } from "child_process";
import { PrismaClient } from "@prisma/client";
import { requireEnv } from "../lib/require-env";

const BASE = process.env.BASE_URL ?? "http://localhost:3099";
const OUTPUT = process.env.OUTPUT_FILE ?? "docs/test-reports/bf4-verifying-e2e-2026-04-12.json";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@aigc-gateway.local";
const ADMIN_PASSWORD = requireEnv("ADMIN_TEST_PASSWORD");

const prisma = new PrismaClient();

type Step = { id: string; ok: boolean; detail: string };
type ApiRes = { status: number; body: any; text: string };

let adminToken = "";

const created = {
  users: [] as string[],
  projects: [] as string[],
  keyIds: [] as string[],
  modelIds: [] as string[],
  channelIds: [] as string[],
  aliasIds: [] as string[],
  linkIds: [] as string[],
  actionIds: [] as string[],
  templateIds: [] as string[],
  templateStepIds: [] as string[],
};

function uniq(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function text(path: string) {
  return readFileSync(path, "utf8");
}

async function api(
  path: string,
  init?: RequestInit & { auth?: "none" | "admin" | "jwt"; token?: string; expect?: number },
): Promise<ApiRes> {
  const { auth = "none", token, expect, ...rest } = init ?? {};
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(rest.headers as Record<string, string> | undefined),
  };
  if (auth === "admin" && adminToken) headers.authorization = `Bearer ${adminToken}`;
  if (auth === "jwt" && token) headers.authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...rest, headers, redirect: "manual" });
  const raw = await res.text();
  let body: any = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = raw;
  }
  if (typeof expect === "number" && res.status !== expect) {
    throw new Error(`${path} expected ${expect}, got ${res.status}: ${JSON.stringify(body)}`);
  }
  return { status: res.status, body, text: raw };
}

async function loginAdmin() {
  const res = await api("/api/auth/login", {
    method: "POST",
    expect: 200,
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  adminToken = String(res.body?.token ?? "");
  if (!adminToken) throw new Error("admin token missing");
}

async function registerAndLoginUser(tag: string) {
  const email = `${tag}_${Date.now()}@test.local`;
  const password = requireEnv("E2E_TEST_PASSWORD");
  const reg = await api("/api/auth/register", {
    method: "POST",
    expect: 201,
    body: JSON.stringify({ email, password, name: tag }),
  });
  const userId = String(reg.body?.id ?? "");
  const defaultProjectId = String(reg.body?.defaultProjectId ?? "");
  if (!userId || !defaultProjectId) throw new Error("register missing user/defaultProjectId");
  created.users.push(userId);
  created.projects.push(defaultProjectId);

  const login = await api("/api/auth/login", {
    method: "POST",
    expect: 200,
    body: JSON.stringify({ email, password }),
  });
  const token = String(login.body?.token ?? "");
  if (!token) throw new Error("login token missing");

  const key = await api("/api/keys", {
    method: "POST",
    auth: "jwt",
    token,
    expect: 201,
    body: JSON.stringify({ name: `${tag}-key` }),
  });
  const apiKey = String(key.body?.key ?? "");
  const keyId = String(key.body?.id ?? "");
  if (!apiKey || !keyId) throw new Error("api key create missing key/id");
  created.keyIds.push(keyId);

  return { userId, defaultProjectId, token, apiKey };
}

async function callMcpTool(apiKey: string, name: string, args: Record<string, unknown>) {
  const rpcBody = {
    jsonrpc: "2.0",
    id: Date.now(),
    method: "tools/call",
    params: { name, arguments: args },
  };

  const res = await fetch(`${BASE}/api/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(rpcBody),
  });

  const textBody = await res.text();
  let rpc: any = null;
  try {
    rpc = JSON.parse(textBody);
  } catch {
    for (const line of textBody.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice("data: ".length).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        rpc = JSON.parse(payload);
      } catch {
        // ignore parse error
      }
      if (rpc) break;
    }
  }
  return { status: res.status, rpc, raw: textBody };
}

function parseToolTextResult(rpc: any): any {
  const txt = rpc?.result?.content?.[0]?.text;
  if (!txt || typeof txt !== "string") return null;
  try {
    return JSON.parse(txt);
  } catch {
    return txt;
  }
}

function runTsc() {
  const r = spawnSync("npx", ["tsc", "--noEmit"], { cwd: process.cwd(), encoding: "utf8" });
  return {
    ok: r.status === 0,
    detail: `exit=${r.status} stderr=${(r.stderr || "").slice(0, 180)}`,
  };
}

async function seedAliasFixture(params: {
  alias: string;
  modality: "TEXT" | "IMAGE";
  modelName: string;
  capabilities?: Record<string, unknown>;
  supportedSizes?: string[];
  sellPrice: Record<string, unknown>;
}) {
  const openai = await prisma.provider.findUnique({ where: { name: "openai" } });
  if (!openai) throw new Error("openai provider missing");

  const model = await prisma.model.create({
    data: {
      name: params.modelName.toLowerCase(),
      displayName: params.modelName,
      modality: params.modality,
      enabled: true,
      ...(params.supportedSizes ? { supportedSizes: params.supportedSizes } : {}),
    },
  });
  created.modelIds.push(model.id);

  const channel = await prisma.channel.create({
    data: {
      providerId: openai.id,
      modelId: model.id,
      realModelId: `${params.alias}-real-model`,
      priority: 1,
      status: "ACTIVE",
      costPrice:
        params.modality === "IMAGE"
          ? { unit: "call", perCall: 0 }
          : { unit: "token", inputPer1M: 0, outputPer1M: 0 },
      sellPrice: params.sellPrice,
    },
  });
  created.channelIds.push(channel.id);

  const alias = await prisma.modelAlias.create({
    data: {
      alias: params.alias,
      modality: params.modality,
      enabled: true,
      capabilities: params.capabilities ?? {},
    },
  });
  created.aliasIds.push(alias.id);

  const link = await prisma.aliasModelLink.create({
    data: { aliasId: alias.id, modelId: model.id },
  });
  created.linkIds.push(link.id);

  return { alias, model, channel };
}

async function cleanup() {
  if (created.templateStepIds.length) {
    await prisma.templateStep.deleteMany({ where: { id: { in: created.templateStepIds } } });
  }
  if (created.templateIds.length) {
    await prisma.template.deleteMany({ where: { id: { in: created.templateIds } } });
  }
  if (created.actionIds.length) {
    await prisma.action.deleteMany({ where: { id: { in: created.actionIds } } });
  }
  if (created.linkIds.length) {
    await prisma.aliasModelLink.deleteMany({ where: { id: { in: created.linkIds } } });
  }
  if (created.aliasIds.length) {
    await prisma.modelAlias.deleteMany({ where: { id: { in: created.aliasIds } } });
  }
  if (created.channelIds.length) {
    await prisma.healthCheck.deleteMany({ where: { channelId: { in: created.channelIds } } });
    await prisma.channel.deleteMany({ where: { id: { in: created.channelIds } } });
  }
  if (created.modelIds.length) {
    await prisma.model.deleteMany({ where: { id: { in: created.modelIds } } });
  }
  if (created.keyIds.length) {
    await prisma.apiKey.deleteMany({ where: { id: { in: created.keyIds } } });
  }
  if (created.projects.length) {
    await prisma.project.deleteMany({ where: { id: { in: created.projects } } });
  }
  if (created.users.length) {
    await prisma.user.deleteMany({ where: { id: { in: created.users } } });
  }
}

async function main() {
  const steps: Step[] = [];
  await loginAdmin();

  const u1 = await registerAndLoginUser("bf4_u1");
  const u2 = await registerAndLoginUser("bf4_u2");

  // F-BF4-01: 注册自动创建默认项目 + 无需手动建项目可创建 key
  const u1Project = await prisma.project.findUnique({ where: { id: u1.defaultProjectId } });
  const bf401ok = Boolean(u1Project && u1Project.userId === u1.userId);
  steps.push({
    id: "F-BF4-01-register-default-project",
    ok: bf401ok,
    detail: `defaultProjectExists=${bf401ok} projectName=${u1Project?.name ?? "na"}`,
  });

  // F-BF4-02: MCP auth defaultProject 无效时 fallback，不报 500
  await prisma.user.update({
    where: { id: u1.userId },
    data: { defaultProjectId: "proj_nonexistent_for_bf4" },
  });
  const mcpFallbackCall = await callMcpTool(u1.apiKey, "list_models", {});
  const bf402ok =
    mcpFallbackCall.status === 200 &&
    mcpFallbackCall.rpc &&
    !mcpFallbackCall.rpc.error &&
    mcpFallbackCall.rpc.result;
  steps.push({
    id: "F-BF4-02-mcp-auth-fallback-project",
    ok: Boolean(bf402ok),
    detail: `status=${mcpFallbackCall.status} hasResult=${Boolean(mcpFallbackCall.rpc?.result)} hasError=${Boolean(mcpFallbackCall.rpc?.error)}`,
  });

  // Fixtures for BF4-03/05/06
  const imageAlias = await seedAliasFixture({
    alias: uniq("bf4_image_alias"),
    modality: "IMAGE",
    modelName: uniq("bf4_image_model"),
    capabilities: { vision: true, supported_sizes: ["999x999"] },
    supportedSizes: ["512x512", "1024x1024"],
    sellPrice: { unit: "call", perCall: 0 },
  });
  const textFreeCap = await seedAliasFixture({
    alias: uniq("bf4_text_free_fc"),
    modality: "TEXT",
    modelName: uniq("bf4_text_model_free"),
    capabilities: { function_calling: true, streaming: true },
    sellPrice: { unit: "token", inputPer1M: 0, outputPer1M: 0 },
  });
  const textPaidCap = await seedAliasFixture({
    alias: uniq("bf4_text_paid_fc"),
    modality: "TEXT",
    modelName: uniq("bf4_text_model_paid"),
    capabilities: { function_calling: true },
    sellPrice: { unit: "token", inputPer1M: 1.1, outputPer1M: 2.2 },
  });
  const textNoCap = await seedAliasFixture({
    alias: uniq("bf4_text_no_fc"),
    modality: "TEXT",
    modelName: uniq("bf4_text_model_nocap"),
    capabilities: { function_calling: false },
    sellPrice: { unit: "token", inputPer1M: 0, outputPer1M: 0 },
  });

  // F-BF4-03: supportedSizes 顶层统一，capabilities 不含 supported_sizes
  const modelsImage = await api("/api/v1/models?modality=image", { expect: 200 });
  const imageRow = (modelsImage.body?.data ?? []).find((m: any) => m.id === imageAlias.alias.alias);
  const v1SizesOk =
    imageRow &&
    Array.isArray(imageRow.supportedSizes) &&
    imageRow.supportedSizes.includes("1024x1024") &&
    (!imageRow.capabilities || imageRow.capabilities.supported_sizes === undefined);
  const mcpListImage = await callMcpTool(u1.apiKey, "list_models", { modality: "image" });
  const mcpImageParsed = parseToolTextResult(mcpListImage.rpc);
  const mcpImageRow = Array.isArray(mcpImageParsed)
    ? mcpImageParsed.find((x: any) => x.name === imageAlias.alias.alias)
    : null;
  const mcpSizesOk =
    mcpImageRow &&
    Array.isArray(mcpImageRow.supportedSizes) &&
    mcpImageRow.capabilities?.supported_sizes === undefined;
  steps.push({
    id: "F-BF4-03-supported-sizes-unified",
    ok: Boolean(v1SizesOk && mcpSizesOk),
    detail: `v1SizesOk=${Boolean(v1SizesOk)} mcpSizesOk=${Boolean(mcpSizesOk)}`,
  });

  // F-BF4-04: 公共模板跨项目预览
  const action = await prisma.action.create({
    data: {
      projectId: u1.defaultProjectId,
      name: uniq("bf4_action"),
      model: textFreeCap.alias.alias,
      description: "bf4 action",
    },
  });
  created.actionIds.push(action.id);
  const tpl = await prisma.template.create({
    data: {
      projectId: u1.defaultProjectId,
      name: uniq("bf4_public_tpl"),
      description: "bf4 public template",
      isPublic: true,
    },
  });
  created.templateIds.push(tpl.id);
  const tplStep = await prisma.templateStep.create({
    data: { templateId: tpl.id, actionId: action.id, order: 1, role: "SEQUENTIAL" },
  });
  created.templateStepIds.push(tplStep.id);

  const mcpTpl = await callMcpTool(u2.apiKey, "get_template_detail", { template_id: tpl.id });
  const tplParsed = parseToolTextResult(mcpTpl.rpc);
  const bf404ok =
    mcpTpl.status === 200 &&
    !mcpTpl.rpc?.error &&
    tplParsed &&
    tplParsed.id === tpl.id &&
    tplParsed.isPublicPreview === true &&
    tplParsed.stepCount === 1;
  steps.push({
    id: "F-BF4-04-public-template-preview",
    ok: Boolean(bf404ok),
    detail: `status=${mcpTpl.status} isPublicPreview=${String(tplParsed?.isPublicPreview)} stepCount=${String(tplParsed?.stepCount ?? "na")}`,
  });

  // F-BF4-05: MCP list_models 结构化 pricing（保留 price 字符串）
  const mcpListText = await callMcpTool(u1.apiKey, "list_models", { modality: "text" });
  const mcpTextParsed = parseToolTextResult(mcpListText.rpc);
  const targetPrice = Array.isArray(mcpTextParsed)
    ? mcpTextParsed.find((x: any) => x.name === textPaidCap.alias.alias)
    : null;
  const bf405ok =
    targetPrice &&
    typeof targetPrice.price === "string" &&
    targetPrice.pricing &&
    typeof targetPrice.pricing.inputPerMillion === "number" &&
    typeof targetPrice.pricing.outputPerMillion === "number" &&
    targetPrice.pricing.currency === "USD";
  steps.push({
    id: "F-BF4-05-mcp-pricing-structured",
    ok: Boolean(bf405ok),
    detail: `hasPriceString=${Boolean(targetPrice && typeof targetPrice.price === "string")} hasPricingObject=${Boolean(targetPrice?.pricing)} currency=${String(targetPrice?.pricing?.currency ?? "na")}`,
  });

  // F-BF4-06: capability/free_only 过滤（v1 + MCP）
  const v1Filtered = await api("/api/v1/models?modality=text&capability=function_calling&free_only=true", {
    expect: 200,
  });
  const v1Names = new Set((v1Filtered.body?.data ?? []).map((x: any) => x.id));
  const v1FilterOk =
    v1Names.has(textFreeCap.alias.alias) &&
    !v1Names.has(textPaidCap.alias.alias) &&
    !v1Names.has(textNoCap.alias.alias);

  const mcpFiltered = await callMcpTool(u1.apiKey, "list_models", {
    modality: "text",
    capability: "function_calling",
    free_only: true,
  });
  const mcpFilteredParsed = parseToolTextResult(mcpFiltered.rpc);
  const mcpNames = new Set(
    Array.isArray(mcpFilteredParsed) ? mcpFilteredParsed.map((x: any) => String(x.name)) : [],
  );
  const mcpFilterOk =
    mcpNames.has(textFreeCap.alias.alias) &&
    !mcpNames.has(textPaidCap.alias.alias) &&
    !mcpNames.has(textNoCap.alias.alias);
  steps.push({
    id: "F-BF4-06-capability-free-filters",
    ok: Boolean(v1FilterOk && mcpFilterOk),
    detail: `v1FilterOk=${v1FilterOk} mcpFilterOk=${mcpFilterOk}`,
  });

  // F-BF4-07: MCP DX 小改进（文案 + 空结果引导）
  const chatFile = text("src/lib/mcp/tools/chat.ts");
  const logsFile = text("src/lib/mcp/tools/list-logs.ts");
  const usageFile = text("src/lib/mcp/tools/get-usage-summary.ts");
  const updateTplFile = text("src/lib/mcp/tools/update-template.ts");
  const dxStaticOk =
    chatFile.includes("e.g. gpt-4o-mini, claude-sonnet-4.6, deepseek-v3, gemini-3-flash") &&
    logsFile.includes("No call logs yet. Use chat or generate_image to make your first API call") &&
    usageFile.includes("No usage data found for this period. Make some API calls first") &&
    updateTplFile.includes("WARNING: full replacement");

  const logsEmpty = await callMcpTool(u2.apiKey, "list_logs", { limit: 5 });
  const logsParsed = parseToolTextResult(logsEmpty.rpc);
  const usageEmpty = await callMcpTool(u2.apiKey, "get_usage_summary", { period: "today" });
  const usageParsed = parseToolTextResult(usageEmpty.rpc);
  const dxRuntimeOk =
    typeof logsParsed?.message === "string" &&
    logsParsed.message.includes("No call logs yet") &&
    typeof usageParsed?.message === "string" &&
    usageParsed.message.includes("No usage data found");

  steps.push({
    id: "F-BF4-07-mcp-dx-improvements",
    ok: Boolean(dxStaticOk && dxRuntimeOk),
    detail: `dxStaticOk=${dxStaticOk} dxRuntimeOk=${dxRuntimeOk}`,
  });

  const tsc = runTsc();
  steps.push({ id: "F-BF4-tsc", ok: tsc.ok, detail: tsc.detail });

  const pass = steps.filter((s) => s.ok).length;
  const fail = steps.length - pass;
  const report = {
    batch: "BF4-dx-feedback",
    executedAt: new Date().toISOString(),
    baseUrl: BASE,
    pass,
    fail,
    steps,
  };
  writeFileSync(OUTPUT, JSON.stringify(report, null, 2));

  if (fail > 0) {
    console.error(`verification failed: ${fail} step(s) failed`);
    process.exitCode = 1;
  } else {
    console.log(`verification passed: ${pass}/${steps.length}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup().catch(() => {});
    await prisma.$disconnect();
  });

