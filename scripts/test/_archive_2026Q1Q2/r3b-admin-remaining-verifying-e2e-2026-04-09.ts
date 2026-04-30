import { readFileSync, writeFileSync } from "fs";
import { requireEnv } from "../lib/require-env";

const BASE = process.env.BASE_URL ?? "http://localhost:3199";
const OUTPUT =
  process.env.OUTPUT_FILE ?? "docs/test-reports/r3b-admin-remaining-verifying-e2e-2026-04-09.json";

type Step = { name: string; ok: boolean; detail: string };

const RUN_ID = Date.now();
const devEmail = `r3b_eval_${RUN_ID}@test.local`;
const devPassword = requireEnv("E2E_TEST_PASSWORD");
const projectName = `R3B Eval Project ${RUN_ID}`;
const actionName = `r3b_eval_action_${RUN_ID}`;
const templateName = `r3b_eval_template_${RUN_ID}`;

let adminToken = "";
let devToken = "";
let devUserId = "";
let projectId = "";
let actionId = "";
let templateId = "";

const pageFiles = [
  "src/app/(console)/admin/health/page.tsx",
  "src/app/(console)/admin/logs/page.tsx",
  "src/app/(console)/admin/usage/page.tsx",
  "src/app/(console)/admin/users/page.tsx",
  "src/app/(console)/admin/users/[id]/page.tsx",
  "src/app/(console)/admin/templates/page.tsx",
];

async function api(
  path: string,
  init?: RequestInit & { expect?: number; auth?: "admin" | "dev" | "none" },
) {
  const { expect, auth = "none", ...rest } = init ?? {};
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(rest.headers as Record<string, string> | undefined),
  };
  if (auth === "admin" && adminToken) headers.Authorization = `Bearer ${adminToken}`;
  if (auth === "dev" && devToken) headers.Authorization = `Bearer ${devToken}`;

  const res = await fetch(`${BASE}${path}`, { ...rest, headers, redirect: "manual" });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (expect && res.status !== expect) {
    throw new Error(`${path} expected ${expect}, got ${res.status}: ${JSON.stringify(body)}`);
  }
  return { status: res.status, body, text, headers: res.headers };
}

function readText(path: string) {
  return readFileSync(path, "utf8");
}

function containsAll(text: string, tokens: string[]) {
  return tokens.every((t) => text.includes(t));
}

async function setupFixture() {
  const adminLogin = await api("/api/auth/login", {
    method: "POST",
    auth: "none",
    expect: 200,
    body: JSON.stringify({ email: "admin@aigc-gateway.local", password: requireEnv("ADMIN_TEST_PASSWORD") }),
  });
  adminToken = String(adminLogin.body?.token ?? "");
  if (!adminToken) throw new Error("admin token missing");

  await api("/api/auth/register", {
    method: "POST",
    auth: "none",
    expect: 201,
    body: JSON.stringify({ email: devEmail, password: devPassword, name: "R3B Eval User" }),
  });

  const devLogin = await api("/api/auth/login", {
    method: "POST",
    auth: "none",
    expect: 200,
    body: JSON.stringify({ email: devEmail, password: devPassword }),
  });
  devToken = String(devLogin.body?.token ?? "");
  devUserId = String(devLogin.body?.user?.id ?? "");
  if (!devToken || !devUserId) throw new Error("dev login failed");

  const project = await api("/api/projects", {
    method: "POST",
    auth: "dev",
    expect: 201,
    body: JSON.stringify({ name: projectName }),
  });
  projectId = String(project.body?.id ?? "");
  if (!projectId) throw new Error("project id missing");

  const action = await api(`/api/projects/${projectId}/actions`, {
    method: "POST",
    auth: "dev",
    expect: 201,
    body: JSON.stringify({
      name: actionName,
      description: "R3B evaluator action",
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: "hello {{topic}}" }],
      variables: [{ name: "topic", description: "topic", required: true }],
      changelog: "init",
    }),
  });
  actionId = String(action.body?.id ?? "");
  if (!actionId) throw new Error("action id missing");

  const tpl = await api(`/api/projects/${projectId}/templates`, {
    method: "POST",
    auth: "dev",
    expect: 201,
    body: JSON.stringify({
      name: templateName,
      description: "R3B evaluator template",
      steps: [{ actionId, order: 0, role: "SEQUENTIAL" }],
    }),
  });
  templateId = String(tpl.body?.id ?? "");
  if (!templateId) throw new Error("template id missing");
}

async function run() {
  const steps: Step[] = [];

  try {
    await setupFixture();

    // AC1: smoke + page load
    const smoke = await api("/api/v1/models", { method: "GET", auth: "none", expect: 200 });
    steps.push({
      name: "AC1 smoke endpoint /api/v1/models ready",
      ok: Array.isArray(smoke.body?.data),
      detail: `status=${smoke.status}, models=${smoke.body?.data?.length ?? 0}`,
    });

    const pages = ["/admin/health", "/admin/logs", "/admin/usage", "/admin/users", "/admin/templates"];
    const pageStatus: string[] = [];
    let pageOk = true;
    for (const p of pages) {
      const r = await api(p, { method: "GET", auth: "admin", expect: 200 });
      const htmlLike = typeof r.text === "string" && r.text.includes("<!DOCTYPE html>");
      pageOk = pageOk && htmlLike;
      pageStatus.push(`${p}:${r.status}/${htmlLike ? "html" : "non-html"}`);
    }
    const detailPage = await api(`/admin/users/${devUserId}`, { method: "GET", auth: "admin", expect: 200 });
    pageOk = pageOk && detailPage.text.includes("<!DOCTYPE html>");
    pageStatus.push(`/admin/users/[id]:${detailPage.status}`);
    steps.push({
      name: "AC1 6 admin pages load with admin auth",
      ok: pageOk,
      detail: pageStatus.join(", "),
    });

    // AC2: source pattern checks
    let useAsyncDataOk = true;
    const useAsyncDetails: string[] = [];
    for (const file of pageFiles) {
      const src = readText(file);
      const hasAsync = src.includes("useAsyncData");
      const hasUseEffect = src.includes("useEffect(");
      const hasUseCallback = src.includes("useCallback(");
      const ok = hasAsync && !hasUseEffect && !hasUseCallback;
      useAsyncDataOk = useAsyncDataOk && ok;
      useAsyncDetails.push(`${file}:${ok ? "ok" : "bad"}`);
    }
    steps.push({
      name: "AC2 useAsyncData migration is present on all 6 pages",
      ok: useAsyncDataOk,
      detail: useAsyncDetails.join(", "),
    });

    // AC3: API + CRUD
    const health = await api("/api/admin/health", { auth: "admin", expect: 200 });
    const logs = await api("/api/admin/logs?page=1&pageSize=20", { auth: "admin", expect: 200 });
    const logsSearch = await api("/api/admin/logs/search?q=r3b&page=1", { auth: "admin", expect: 200 });
    const usage = await api("/api/admin/usage?period=7d", { auth: "admin", expect: 200 });
    const usageByProvider = await api("/api/admin/usage/by-provider", { auth: "admin", expect: 200 });
    const usageByModel = await api("/api/admin/usage/by-model", { auth: "admin", expect: 200 });
    const users = await api("/api/admin/users", { auth: "admin", expect: 200 });
    const userDetail = await api(`/api/admin/users/${devUserId}`, { auth: "admin", expect: 200 });
    const templates = await api("/api/admin/templates?page=1&pageSize=20", { auth: "admin", expect: 200 });

    const recharge = await api(`/api/admin/users/${devUserId}/projects/${projectId}/recharge`, {
      method: "POST",
      auth: "admin",
      expect: 201,
      body: JSON.stringify({ amount: 1, description: "R3B evaluator recharge" }),
    });

    const listBeforePatch = await api("/api/admin/templates?page=1&pageSize=50", {
      auth: "admin",
      expect: 200,
    });
    const createdTemplate = (listBeforePatch.body?.data ?? []).find((t: any) => t.id === templateId);
    if (!createdTemplate) throw new Error("fixture template not found in admin list");

    const toggled = await api(`/api/admin/templates/${templateId}`, {
      method: "PATCH",
      auth: "admin",
      expect: 200,
      body: JSON.stringify({ isPublic: !Boolean(createdTemplate.isPublic) }),
    });
    const deleted = await api(`/api/admin/templates/${templateId}`, {
      method: "DELETE",
      auth: "admin",
      expect: 200,
    });

    const crudOk =
      Array.isArray(health.body?.data) &&
      Array.isArray(logs.body?.data) &&
      Array.isArray(logsSearch.body?.data) &&
      typeof usage.body?.totalCalls === "number" &&
      Array.isArray(usageByProvider.body?.data) &&
      Array.isArray(usageByModel.body?.data) &&
      Array.isArray(users.body?.data) &&
      Array.isArray(userDetail.body?.projects) &&
      Array.isArray(templates.body?.data) &&
      recharge.status === 201 &&
      toggled.status === 200 &&
      deleted.status === 200;

    steps.push({
      name: "AC3 CRUD and core APIs are functional",
      ok: crudOk,
      detail: `health=${health.body?.data?.length ?? 0}, logs=${logs.body?.data?.length ?? 0}, logsSearch=${logsSearch.body?.data?.length ?? 0}, users=${users.body?.data?.length ?? 0}, userProjects=${userDetail.body?.projects?.length ?? 0}, templates=${templates.body?.data?.length ?? 0}, recharge=${recharge.status}, toggle=${toggled.status}, delete=${deleted.status}`,
    });

    // AC4: i18n checks
    const en = readText("src/messages/en.json");
    const zh = readText("src/messages/zh-CN.json");

    const i18nKeysOk =
      containsAll(en, ['"adminHealth"', '"adminLogs"', '"adminUsage"', '"adminUsers"', '"adminTemplates"']) &&
      containsAll(zh, ['"adminHealth"', '"adminLogs"', '"adminUsage"', '"adminUsers"', '"adminTemplates"']);

    const healthSrc = readText("src/app/(console)/admin/health/page.tsx");
    const logsSrc = readText("src/app/(console)/admin/logs/page.tsx");
    const usageSrc = readText("src/app/(console)/admin/usage/page.tsx");
    const userDetailSrc = readText("src/app/(console)/admin/users/[id]/page.tsx");
    const templatesSrc = readText("src/app/(console)/admin/templates/page.tsx");

    const bannedLegacyPhrases = [
      "Real-time infrastructure health monitoring",
      "Total Channels",
      "Active Models",
      "Degraded State",
      "Disabled Nodes",
      "System-wide audit logs",
      "Traffic Insight",
      "Error Spike Alert",
      "Visibility:",
      "Deactivate User (Coming Soon)",
      "Reset Balance (Coming Soon)",
    ];

    const legacyRemoved =
      !bannedLegacyPhrases.some((p) =>
        [healthSrc, logsSrc, usageSrc, userDetailSrc, templatesSrc].some((s) => s.includes(p)),
      );

    // Detect obvious remaining hardcoded EN that is user-visible.
    const knownHardcoded: string[] = [];
    if (templatesSrc.includes('confirm(`Delete template "${name}"?`)')) {
      knownHardcoded.push("templates.delete-confirm");
    }
    // Keep internal values ["today","7d","30d"] allowed when rendered label is translated.
    const usagePeriodTranslated = usageSrc.includes('t(`period_${p}`)');
    if (!usagePeriodTranslated && usageSrc.includes('"today"')) {
      knownHardcoded.push("usage.period-today");
    }

    steps.push({
      name: "AC4 i18n keys exist and legacy hardcoded phrases are removed",
      ok: i18nKeysOk && legacyRemoved && knownHardcoded.length === 0,
      detail: `keys=${i18nKeysOk}, legacyRemoved=${legacyRemoved}, hardcoded=${knownHardcoded.join("|") || "none"}`,
    });

    // AC5: design alignment spot checks
    const healthDesignOk = containsAll(healthSrc, [
      "CHECK_LABEL_KEYS",
      "check_circle",
      "warning",
      "cancel",
      't("manualCheck")',
    ]);
    const logsDesignOk = containsAll(logsSrc, [
      't("trafficInsight")',
      't("errorSpikeAlert")',
      "insights",
      "warning",
    ]);
    const usageDesignOk = containsAll(usageSrc, [
      't("revenueByProvider")',
      't("callsByModel")',
      't("providerCost")',
    ]);
    const usersDesignOk = containsAll(userDetailSrc, [
      'href="/admin/users"',
      't("projects")',
      't("manualRecharge")',
    ]);
    const templatesDesignOk = containsAll(templatesSrc, [
      't("visibilityLabel")',
      "<Switch",
      't("colActions")',
    ]);

    steps.push({
      name: "AC5 design-draft spot checks pass for 6 pages",
      ok: healthDesignOk && logsDesignOk && usageDesignOk && usersDesignOk && templatesDesignOk,
      detail: `health=${healthDesignOk}, logs=${logsDesignOk}, usage=${usageDesignOk}, users=${usersDesignOk}, templates=${templatesDesignOk}`,
    });

    const passCount = steps.filter((s) => s.ok).length;
    const failCount = steps.length - passCount;
    writeFileSync(
      OUTPUT,
      JSON.stringify(
        {
          baseUrl: BASE,
          runId: RUN_ID,
          fixtures: { devEmail, devUserId, projectId, actionId, templateId },
          passCount,
          failCount,
          steps,
        },
        null,
        2,
      ),
      "utf8",
    );

    if (failCount > 0) {
      console.error(`[r3b-admin-remaining-verifying] failed: ${failCount} step(s) failed`);
      process.exit(1);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.stack ?? err.message : String(err);
    writeFileSync(
      OUTPUT,
      JSON.stringify(
        {
          baseUrl: BASE,
          runId: RUN_ID,
          fixtures: { devEmail, devUserId, projectId, actionId, templateId },
          passCount: 0,
          failCount: 1,
          steps: [{ name: "script runtime", ok: false, detail: msg }],
        },
        null,
        2,
      ),
      "utf8",
    );
    console.error(`[r3b-admin-remaining-verifying] script error: ${msg}`);
    process.exit(1);
  }
}

void run();
