import { PrismaClient } from "@prisma/client";
import path from "node:path";

const prisma = new PrismaClient();
const BASE = process.env.BASE_URL ?? "http://localhost:3099";
const NOW = Date.now();

function requireEnv(key) {
  const v = process.env[key];
  if (!v) {
    const name = process.argv[1] ? path.basename(process.argv[1]) : "script";
    console.error(`[${name}] Missing env: ${key}`);
    process.exit(1);
  }
  return v;
}

function print(obj) {
  process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`);
}

async function api(path, { method = "GET", token, apiKey, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  return {
    status: res.status,
    json,
    text,
    headers: Object.fromEntries(res.headers.entries()),
  };
}

async function mcp(apiKey, method, params = {}) {
  const res = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params,
    }),
  });

  const contentType = res.headers.get("content-type") ?? "";
  const text = await res.text();

  let payload = null;
  if (contentType.includes("text/event-stream")) {
    const lastData = text
      .split("\n")
      .filter((line) => line.startsWith("data: "))
      .at(-1);
    payload = lastData ? JSON.parse(lastData.slice(6)) : null;
  } else {
    payload = text ? JSON.parse(text) : null;
  }

  return { status: res.status, payload, text };
}

function contentText(payload) {
  return payload?.result?.content?.[0]?.text ?? payload?.content?.[0]?.text ?? "";
}

async function run() {
  const results = [];
  const ctx = {};

  async function step(name, fn) {
    try {
      const data = await fn();
      results.push({ name, ok: true, data });
    } catch (error) {
      results.push({ name, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  await step("admin login", async () => {
    const res = await api("/api/auth/login", {
      method: "POST",
      body: { email: "admin@aigc-gateway.local", password: requireEnv("ADMIN_TEST_PASSWORD") },
    });
    if (res.status !== 200 || !res.json?.token) {
      throw new Error(`login failed: ${res.status} ${res.text}`);
    }
    ctx.adminToken = res.json.token;
    return { role: res.json.user.role };
  });

  for (const idx of [1, 2]) {
    await step(`register dev${idx}`, async () => {
      const email = `template-eval-${idx}-${NOW}@local.test`;
      const password = "password123";
      const reg = await api("/api/auth/register", {
        method: "POST",
        body: { email, password, name: `dev${idx}` },
      });
      if (reg.status !== 201) {
        throw new Error(`register failed: ${reg.status} ${reg.text}`);
      }
      const login = await api("/api/auth/login", {
        method: "POST",
        body: { email, password },
      });
      if (login.status !== 200 || !login.json?.token) {
        throw new Error(`dev login failed: ${login.status} ${login.text}`);
      }
      ctx[`dev${idx}Token`] = login.json.token;
      ctx[`dev${idx}Email`] = email;
      return { email, role: login.json.user.role };
    });
  }

  await step("create project + key + balance", async () => {
    const project = await api("/api/projects", {
      method: "POST",
      token: ctx.dev1Token,
      body: { name: `Template Eval ${NOW}` },
    });
    if (project.status !== 201) {
      throw new Error(`create project failed: ${project.status} ${project.text}`);
    }
    ctx.projectId = project.json.id;
    await prisma.project.update({
      where: { id: ctx.projectId },
      data: { balance: 10 },
    });

    const key = await api(`/api/projects/${ctx.projectId}/keys`, {
      method: "POST",
      token: ctx.dev1Token,
      body: { name: "eval-key" },
    });
    if (key.status !== 201 || !key.json?.key) {
      throw new Error(`create key failed: ${key.status} ${key.text}`);
    }
    ctx.apiKey = key.json.key;
    return {
      projectId: ctx.projectId,
      apiKeyPrefix: ctx.apiKey.slice(0, 8),
    };
  });

  await step("smoke models + public templates", async () => {
    const models = await api("/v1/models");
    const templates = await api("/api/public-templates?search=%E7%BF%BB%E8%AF%91");
    if (models.status !== 200 || !Array.isArray(models.json?.data) || models.json.data.length === 0) {
      throw new Error("models unavailable");
    }
    if (
      templates.status !== 200 ||
      !Array.isArray(templates.json?.data) ||
      templates.json.data.length === 0
    ) {
      throw new Error("public templates unavailable");
    }
    ctx.publicTemplateId = templates.json.data[0].id;
    return {
      modelCount: models.json.data.length,
      matchedTemplateCount: templates.json.data.length,
      publicTemplateId: ctx.publicTemplateId,
    };
  });

  await step("admin auth enforced", async () => {
    const res = await api("/api/admin/templates", { token: ctx.dev1Token });
    if (res.status !== 403) {
      throw new Error(`expected 403, got ${res.status}`);
    }
    return { status: res.status, body: res.json };
  });

  await step("admin template CRUD + versioning", async () => {
    const create = await api("/api/admin/templates", {
      method: "POST",
      token: ctx.adminToken,
      body: {
        name: `Admin Template ${NOW}`,
        description: "admin created",
        category: "qa",
        messages: [
          { role: "system", content: "Hello {{name}}" },
          { role: "user", content: "{{input}}" },
        ],
        variables: [
          { name: "name", description: "name", required: false, defaultValue: "tester" },
          { name: "input", description: "input", required: true },
        ],
      },
    });
    if (create.status !== 201) {
      throw new Error(`create admin template failed: ${create.status} ${create.text}`);
    }
    ctx.adminTemplateId = create.json.id;

    const patch = await api(`/api/admin/templates/${ctx.adminTemplateId}`, {
      method: "PATCH",
      token: ctx.adminToken,
      body: { description: "admin updated", category: "ops" },
    });
    const v2 = await api(`/api/admin/templates/${ctx.adminTemplateId}/versions`, {
      method: "POST",
      token: ctx.adminToken,
      body: {
        messages: [
          { role: "system", content: "v2 {{name}}" },
          { role: "user", content: "{{input}}" },
        ],
        variables: [
          { name: "name", description: "name", required: false, defaultValue: "tester" },
          { name: "input", description: "input", required: true },
        ],
        changelog: "v2",
      },
    });
    if (patch.status !== 200 || v2.status !== 201) {
      throw new Error(`admin patch/version failed: ${patch.status}/${v2.status}`);
    }
    ctx.adminTemplateV2 = v2.json.id;

    const activate = await api(`/api/admin/templates/${ctx.adminTemplateId}/active-version`, {
      method: "PATCH",
      token: ctx.adminToken,
      body: { versionId: ctx.adminTemplateV2 },
    });
    const get = await api(`/api/admin/templates/${ctx.adminTemplateId}`, {
      token: ctx.adminToken,
    });
    if (activate.status !== 200 || get.status !== 200 || get.json?.activeVersionId !== ctx.adminTemplateV2) {
      throw new Error("admin activate/get failed");
    }
    return {
      templateId: ctx.adminTemplateId,
      versionCount: get.json.versions.length,
      activeVersionId: get.json.activeVersionId,
      category: get.json.category,
    };
  });

  await step("project template CRUD + ownership + fork", async () => {
    const create = await api(`/api/projects/${ctx.projectId}/templates`, {
      method: "POST",
      token: ctx.dev1Token,
      body: {
        name: `Project Template ${NOW}`,
        description: "project created",
        messages: [
          { role: "system", content: "Role={{role}} RoleAgain={{role}} Tone={{tone}}" },
          { role: "user", content: "{{question}}" },
        ],
        variables: [
          { name: "role", description: "role", required: true },
          { name: "tone", description: "tone", required: false, defaultValue: "formal" },
          { name: "question", description: "question", required: true },
        ],
      },
    });
    if (create.status !== 201) {
      throw new Error(`project create failed: ${create.status} ${create.text}`);
    }
    ctx.projectTemplateId = create.json.id;
    ctx.projectTemplateV1 = create.json.activeVersionId;

    const list = await api(`/api/projects/${ctx.projectId}/templates?search=Project%20Template`, {
      token: ctx.dev1Token,
    });
    const patch = await api(`/api/projects/${ctx.projectId}/templates/${ctx.projectTemplateId}`, {
      method: "PATCH",
      token: ctx.dev1Token,
      body: { description: "project updated" },
    });
    const forbidden = await api(`/api/projects/${ctx.projectId}/templates/${ctx.projectTemplateId}`, {
      token: ctx.dev2Token,
    });
    const fork = await api(`/api/projects/${ctx.projectId}/templates/fork`, {
      method: "POST",
      token: ctx.dev1Token,
      body: { templateId: ctx.publicTemplateId },
    });
    const v2 = await api(`/api/projects/${ctx.projectId}/templates/${ctx.projectTemplateId}/versions`, {
      method: "POST",
      token: ctx.dev1Token,
      body: {
        messages: [
          { role: "system", content: "v2 {{role}} {{tone}}" },
          { role: "user", content: "{{question}}" },
        ],
        variables: [
          { name: "role", description: "role", required: true },
          { name: "tone", description: "tone", required: false, defaultValue: "casual" },
          { name: "question", description: "question", required: true },
        ],
        changelog: "project v2",
      },
    });
    if (list.status !== 200 || patch.status !== 200 || forbidden.status !== 404 || fork.status !== 201 || v2.status !== 201) {
      throw new Error(`project flow failed: ${list.status}/${patch.status}/${forbidden.status}/${fork.status}/${v2.status}`);
    }
    ctx.projectTemplateV2 = v2.json.id;

    const activate = await api(`/api/projects/${ctx.projectId}/templates/${ctx.projectTemplateId}/active-version`, {
      method: "PATCH",
      token: ctx.dev1Token,
      body: { versionId: ctx.projectTemplateV2 },
    });
    const get = await api(`/api/projects/${ctx.projectId}/templates/${ctx.projectTemplateId}`, {
      token: ctx.dev1Token,
    });
    if (activate.status !== 200 || get.status !== 200 || get.json?.activeVersionId !== ctx.projectTemplateV2) {
      throw new Error("project activate/get failed");
    }
    ctx.forkedTemplateId = fork.json.id;
    return {
      templateId: ctx.projectTemplateId,
      activeVersionId: ctx.projectTemplateV2,
      forbiddenStatus: forbidden.status,
      forkedTemplateId: ctx.forkedTemplateId,
      versionCount: get.json.versions.length,
    };
  });

  await step("api templateId precedence error", async () => {
    const res = await api("/v1/chat/completions", {
      method: "POST",
      apiKey: ctx.apiKey,
      body: {
        model: "deepseek/v3",
        messages: [{ role: "user", content: "ignore me" }],
        templateId: ctx.projectTemplateId,
        variables: { role: "lawyer" },
      },
    });
    if (res.status !== 400 || res.json?.error?.code !== "template_error") {
      throw new Error(`expected template_error, got ${res.status} ${res.text}`);
    }
    return {
      status: res.status,
      message: res.json.error.message,
    };
  });

  await step("api chat template logs templateVersionId", async () => {
    const switchToV1 = await api(
      `/api/projects/${ctx.projectId}/templates/${ctx.projectTemplateId}/active-version`,
      {
        method: "PATCH",
        token: ctx.dev1Token,
        body: { versionId: ctx.projectTemplateV1 },
      },
    );
    if (switchToV1.status !== 200) {
      throw new Error(`switch active version failed: ${switchToV1.status} ${switchToV1.text}`);
    }

    const startedAt = new Date();
    const res = await api("/v1/chat/completions", {
      method: "POST",
      apiKey: ctx.apiKey,
      body: {
        model: "deepseek/v3",
        templateId: ctx.projectTemplateId,
        variables: { role: "lawyer", question: "How?" },
        max_tokens: 10,
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    const log = await prisma.callLog.findFirst({
      where: {
        projectId: ctx.projectId,
        source: "api",
        modelName: "deepseek/v3",
        createdAt: { gte: startedAt },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!log) {
      throw new Error("api call log not found");
    }
    ctx.apiTraceId = log.traceId;
    if (log.templateVersionId !== ctx.projectTemplateV1) {
      throw new Error(`expected ${ctx.projectTemplateV1}, got ${log.templateVersionId}`);
    }

    const systemMessage = Array.isArray(log.promptSnapshot) ? log.promptSnapshot[0] : null;
    const systemContent = systemMessage?.content;
    if (
      typeof systemContent !== "string" ||
      !systemContent.includes("Role=lawyer") ||
      !systemContent.includes("RoleAgain=lawyer") ||
      !systemContent.includes("Tone=formal")
    ) {
      throw new Error(`unexpected injected prompt snapshot: ${JSON.stringify(log.promptSnapshot)}`);
    }

    return {
      status: res.status,
      traceId: ctx.apiTraceId,
      logStatus: log.status,
      errorCode: log.errorCode,
      templateVersionId: log.templateVersionId,
      promptSnapshot: log.promptSnapshot,
    };
  });

  await step("quality API updates score", async () => {
    const res = await api(`/api/projects/${ctx.projectId}/logs/${ctx.apiTraceId}/quality`, {
      method: "PATCH",
      token: ctx.dev1Token,
      body: { score: 0.85 },
    });
    if (res.status !== 200) {
      throw new Error(`quality failed: ${res.status} ${res.text}`);
    }
    const log = await prisma.callLog.findUnique({ where: { traceId: ctx.apiTraceId } });
    if (Number(log?.qualityScore) !== 0.85) {
      throw new Error(`quality mismatch: ${log?.qualityScore}`);
    }
    return { traceId: ctx.apiTraceId, qualityScore: Number(log.qualityScore) };
  });

  await step("mcp create_template does not persist", async () => {
    const before = await prisma.template.count({ where: { projectId: ctx.projectId } });
    const res = await mcp(ctx.apiKey, "tools/call", {
      name: "create_template",
      arguments: {
        description: "A template with language variable and input variable for translation",
      },
    });
    const text = contentText(res.payload);
    const parsed = JSON.parse(text);
    const after = await prisma.template.count({ where: { projectId: ctx.projectId } });
    if (!parsed.draft?.messages || before !== after) {
      throw new Error(`template count changed ${before} -> ${after}`);
    }
    return {
      before,
      after,
      variableNames: parsed.draft.variables.map((item) => item.name),
    };
  });

  await step("mcp confirm/list/get/update/chat", async () => {
    const confirm = await mcp(ctx.apiKey, "tools/call", {
      name: "confirm_template",
      arguments: {
        name: `MCP Template ${NOW}`,
        description: "saved via mcp",
        messages: [
          { role: "system", content: "Review {{code}} as {{language}}" },
          { role: "user", content: "{{code}}" },
        ],
        variables: [
          { name: "language", description: "language", required: true },
          { name: "code", description: "code", required: true },
        ],
      },
    });
    const confirmText = contentText(confirm.payload);
    const confirmData = JSON.parse(confirmText);
    ctx.mcpTemplateId = confirmData.templateId;

    const initial = await prisma.template.findUnique({ where: { id: ctx.mcpTemplateId } });
    if (!initial || initial.activeVersionId !== confirmData.versionId) {
      throw new Error("confirm_template did not persist active version");
    }

    const list = await mcp(ctx.apiKey, "tools/call", {
      name: "list_templates",
      arguments: { search: "MCP Template", includePublic: true },
    });
    const listData = JSON.parse(contentText(list.payload));
    if (!listData.templates.some((item) => item.id === ctx.mcpTemplateId)) {
      throw new Error("list_templates missing new template");
    }

    const listPrivateOnly = await mcp(ctx.apiKey, "tools/call", {
      name: "list_templates",
      arguments: { search: "通用翻译助手", includePublic: false },
    });
    const listPrivateData = JSON.parse(contentText(listPrivateOnly.payload));
    if (listPrivateData.templates.some((item) => item.isPublic === true)) {
      throw new Error("includePublic=false still returned public templates");
    }

    const get = await mcp(ctx.apiKey, "tools/call", {
      name: "get_template",
      arguments: { templateId: ctx.mcpTemplateId },
    });
    const getData = JSON.parse(contentText(get.payload));
    if (
      !Array.isArray(getData.versions) ||
      getData.versions.length !== 1 ||
      !Array.isArray(getData.versions[0]?.variables)
    ) {
      throw new Error("get_template missing versions");
    }

    const update = await mcp(ctx.apiKey, "tools/call", {
      name: "update_template",
      arguments: {
        templateId: ctx.mcpTemplateId,
        messages: [
          { role: "system", content: "Updated {{language}} reviewer" },
          { role: "user", content: "{{code}}" },
        ],
        variables: [
          { name: "language", description: "language", required: true },
          { name: "code", description: "code", required: true },
        ],
        changelog: "mcp v2",
      },
    });
    const updateData = JSON.parse(contentText(update.payload));
    const afterUpdate = await prisma.template.findUnique({
      where: { id: ctx.mcpTemplateId },
      include: { versions: true },
    });
    if (afterUpdate.activeVersionId === updateData.versionId) {
      throw new Error("update_template auto-activated new version");
    }
    if (afterUpdate.versions.length !== 2) {
      throw new Error("update_template did not create second version");
    }

    const errorCall = await mcp(ctx.apiKey, "tools/call", {
      name: "chat",
      arguments: {
        model: "deepseek/v3",
        messages: [{ role: "user", content: "ignore me" }],
        templateId: ctx.mcpTemplateId,
        variables: { language: "TypeScript" },
      },
    });
    const errorText = contentText(errorCall.payload);
    const isError = Boolean(errorCall.payload?.result?.isError ?? errorCall.payload?.isError);
    if (!isError || !errorText.includes("Template error: Missing required variables")) {
      throw new Error(`unexpected mcp template error payload: ${JSON.stringify(errorCall.payload)}`);
    }

    const okCall = await mcp(ctx.apiKey, "tools/call", {
      name: "chat",
      arguments: {
        model: "deepseek/v3",
        templateId: ctx.mcpTemplateId,
        variables: { language: "TypeScript", code: "const x = 1" },
        max_tokens: 10,
      },
    });
    const okText = contentText(okCall.payload);
    if (!okText.includes("Missing Authentication header")) {
      throw new Error(`unexpected mcp chat error: ${okText}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
    const log = await prisma.callLog.findFirst({
      where: {
        projectId: ctx.projectId,
        source: "mcp",
        modelName: "deepseek/v3",
      },
      orderBy: { createdAt: "desc" },
    });
    if (!log) {
      throw new Error("mcp call log missing");
    }
    ctx.mcpTraceId = log.traceId;
    if (log.source !== "mcp") {
      throw new Error(`expected source=mcp, got ${log.source}`);
    }
    if (log.templateVersionId !== initial.activeVersionId) {
      throw new Error(`expected templateVersionId=${initial.activeVersionId}, got ${log.templateVersionId}`);
    }

    return {
      templateId: ctx.mcpTemplateId,
      versionCount: afterUpdate.versions.length,
      activeVersionId: afterUpdate.activeVersionId,
      newVersionId: updateData.versionId,
      traceId: ctx.mcpTraceId,
      logSource: log.source,
      logTemplateVersionId: log.templateVersionId,
    };
  });

  await step("delete routes work", async () => {
    const deleteFork = await api(`/api/projects/${ctx.projectId}/templates/${ctx.forkedTemplateId ?? ""}`, {
      method: "DELETE",
      token: ctx.dev1Token,
    });
    const deleteAdmin = await api(`/api/admin/templates/${ctx.adminTemplateId}`, {
      method: "DELETE",
      token: ctx.adminToken,
    });
    const getFork = await api(`/api/projects/${ctx.projectId}/templates/${ctx.forkedTemplateId ?? ""}`, {
      token: ctx.dev1Token,
    });
    const getAdmin = await api(`/api/admin/templates/${ctx.adminTemplateId}`, {
      token: ctx.adminToken,
    });
    if (deleteFork.status !== 200 || deleteAdmin.status !== 200 || getFork.status !== 404 || getAdmin.status !== 404) {
      throw new Error(`delete route validation failed: ${deleteFork.status}/${deleteAdmin.status}/${getFork.status}/${getAdmin.status}`);
    }
    return {
      deleteForkStatus: deleteFork.status,
      deleteAdminStatus: deleteAdmin.status,
      getForkAfterDelete: getFork.status,
      getAdminAfterDelete: getAdmin.status,
    };
  });

  print({ ctx, results });
}

run()
  .catch((error) => {
    print({ fatal: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
