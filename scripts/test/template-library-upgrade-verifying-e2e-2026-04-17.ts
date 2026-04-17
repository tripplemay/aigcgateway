import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import * as path from "path";

const BASE = process.env.BASE_URL ?? "http://localhost:3099";
const OUTPUT =
  process.env.OUTPUT_FILE ?? "docs/test-reports/template-library-upgrade-verifying-local-e2e-2026-04-17.json";

const MCP_PATH = process.env.MCP_PATH ?? "/mcp";
const MCP_FALLBACK_PATH = process.env.MCP_FALLBACK_PATH ?? "/api/mcp";
const PUBLIC_LIST_PATHS = [
  process.env.PUBLIC_LIST_PATH,
  "/api/public-templates",
  "/api/templates/public",
].filter(Boolean) as string[];

const ADMIN_CANDIDATES = [
  {
    email: process.env.ADMIN_EMAIL ?? "admin@aigc-gateway.local",
    password: process.env.ADMIN_PASSWORD ?? "admin123",
  },
  { email: "codex-admin@aigc-gateway.local", password: "Codex@2026!" },
];

type StepResult = {
  id: string;
  ok: boolean;
  detail: string;
};

type ApiResult = {
  status: number;
  body: any;
  text: string;
};

function tag() {
  return Date.now().toString(36);
}

function asErr(err: unknown): string {
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

async function api(pathname: string, init?: RequestInit & { expect?: number | number[] }): Promise<ApiResult> {
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
  throw new Error("admin login failed for all known credentials");
}

async function registerAndLoginUser(t: string): Promise<{ email: string; token: string }> {
  const email = `tl_${t}@test.local`;
  const password = "TL_Test_1234";

  await api("/api/auth/register", {
    method: "POST",
    expect: [200, 201, 409],
    body: JSON.stringify({ email, password, name: `TL Verifier ${t}` }),
  });

  const token = await login(email, password);
  if (!token) throw new Error("test user login failed");
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

async function createAction(token: string, projectId: string, name: string, prompt: string): Promise<string> {
  const r = await api(`/api/projects/${projectId}/actions`, {
    method: "POST",
    expect: 201,
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name,
      description: `${name} description`,
      model: "openrouter/google/gemma-4-26b-a4b-it",
      messages: [{ role: "user", content: prompt }],
      variables: [],
      changelog: "init",
    }),
  });
  const id = String(r.body?.id ?? "");
  if (!id) throw new Error("action id missing");
  return id;
}

async function createTemplate(token: string, projectId: string, name: string, actionIds: string[]): Promise<string> {
  const steps = actionIds.map((actionId, i) => ({ order: i + 1, actionId, role: "SEQUENTIAL" }));
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

async function setTemplatePublic(token: string, templateId: string, category: string, qualityScore: number) {
  return api(`/api/admin/templates/${templateId}`, {
    method: "PATCH",
    expect: [200, 204],
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ isPublic: true, category, qualityScore }),
  });
}

async function upsertCategories(token: string, categories: Array<Record<string, string>>) {
  const value = JSON.stringify(categories);
  await api("/api/admin/config", {
    method: "PUT",
    expect: 200,
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      key: "TEMPLATE_CATEGORIES",
      value,
      description: "Template categories for TEMPLATE-LIBRARY-UPGRADE verifier",
    }),
  });
}

async function readCategories(token: string): Promise<any[]> {
  const r = await api("/api/admin/config", {
    expect: 200,
    headers: { Authorization: `Bearer ${token}` },
  });
  const row = (r.body?.data ?? []).find((x: any) => x?.key === "TEMPLATE_CATEGORIES");
  if (!row?.value) return [];
  try {
    const parsed = JSON.parse(String(row.value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeTemplateRow(row: any) {
  const averageScore = toNum(row?.averageScore ?? row?.qualityScore ?? row?.score);
  const ratingCount = toNum(row?.ratingCount ?? row?.ratingsCount ?? row?.rating_count);
  const forkCount = toNum(row?.forkCount ?? row?.forks ?? row?._count?.forks);
  const updatedAt = String(row?.updatedAt ?? row?.updated_at ?? "");
  return {
    id: String(row?.id ?? ""),
    name: String(row?.name ?? ""),
    category: row?.category ? String(row.category) : "",
    categoryIcon: row?.categoryIcon ? String(row.categoryIcon) : "",
    averageScore,
    ratingCount,
    forkCount,
    updatedAt,
    raw: row,
  };
}

async function listPublicTemplates(token: string, query: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && String(v).length > 0) search.set(k, String(v));
  }

  let lastErr = "";
  for (const p of PUBLIC_LIST_PATHS) {
    const pathname = `${p}${search.toString() ? `?${search.toString()}` : ""}`;
    try {
      const r = await api(pathname, {
        expect: 200,
        headers: { Authorization: `Bearer ${token}` },
      });

      const rows = Array.isArray(r.body?.data)
        ? r.body.data
        : Array.isArray(r.body?.templates)
          ? r.body.templates
          : Array.isArray(r.body)
            ? r.body
            : [];

      return {
        path: p,
        rows: rows.map(normalizeTemplateRow),
        body: r.body,
      };
    } catch (err) {
      lastErr = `${p}: ${asErr(err)}`;
    }
  }

  throw new Error(`public templates API unavailable: ${lastErr}`);
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
      if (!key) throw new Error(`api key missing in response for ${t.path}`);
      return key;
    } catch (err) {
      lastErr = `${t.path}: ${asErr(err)}`;
    }
  }

  throw new Error(`create api key failed: ${lastErr}`);
}

async function rawMcp(apiKey: string, method: string, params?: Record<string, unknown>, preferFallback = false) {
  const mcpPath = preferFallback ? MCP_FALLBACK_PATH : MCP_PATH;
  const r = await fetch(`${BASE}${mcpPath}`, {
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
  return { status: r.status, body, text, path: mcpPath };
}

async function rawMcpWithFallback(apiKey: string, method: string, params?: Record<string, unknown>) {
  const primary = await rawMcp(apiKey, method, params, false);
  if (primary.status !== 404) return primary;
  return rawMcp(apiKey, method, params, true);
}

async function callMcpTool(apiKey: string, name: string, args: Record<string, unknown>) {
  const rpc = await rawMcpWithFallback(apiKey, "tools/call", { name, arguments: args });
  if (rpc.status >= 400) throw new Error(`MCP tools/call ${name} http ${rpc.status}: ${rpc.text}`);
  if (rpc.body?.error) throw new Error(`MCP tools/call ${name} rpc error: ${JSON.stringify(rpc.body.error)}`);
  const result = rpc.body?.result ?? rpc.body;
  if (result?.isError) throw new Error(`MCP tools/call ${name} tool error`);
  return result;
}

function parseMcpToolJson(result: any): any {
  const text = String(result?.content?.[0]?.text ?? "");
  if (!text) throw new Error("empty MCP tool text content");
  return JSON.parse(text);
}

function readAllFilesUnder(root: string, exts: string[]): string {
  const out: string[] = [];

  function walk(p: string) {
    const st = statSync(p);
    if (st.isDirectory()) {
      for (const child of readdirSync(p)) walk(path.join(p, child));
      return;
    }
    if (exts.some((ext) => p.endsWith(ext))) {
      out.push(readFileSync(p, "utf8"));
    }
  }

  walk(root);
  return out.join("\n");
}

async function run() {
  const steps: StepResult[] = [];
  const context: Record<string, unknown> = {};

  try {
    const t = tag();
    const admin = await loginAdmin();
    const user = await registerAndLoginUser(t);

    context.adminEmail = admin.email;
    context.userEmail = user.email;

    const adminProjectId = await createProject(admin.token, `TL Admin ${t}`);
    const userProjectId = await createProject(user.token, `TL User ${t}`);
    context.adminProjectId = adminProjectId;
    context.userProjectId = userProjectId;

    const a1 = await createAction(admin.token, adminProjectId, `tl-a1-${t}`, "review this code");
    const a2 = await createAction(admin.token, adminProjectId, `tl-a2-${t}`, "summarize risk");

    const targetCategory = "dev-review";
    const categories = [
      { id: "dev-review", label: "开发审查", labelEn: "Dev Review", icon: "code_review" },
      { id: "writing", label: "内容创作", labelEn: "Writing", icon: "edit_note" },
      { id: "translation", label: "翻译", labelEn: "Translation", icon: "translate" },
      { id: "analysis", label: "数据分析", labelEn: "Analysis", icon: "analytics" },
      { id: "customer-service", label: "客服", labelEn: "Customer Service", icon: "support_agent" },
      { id: "other", label: "其他", labelEn: "Other", icon: "category" },
    ];

    // AC1: category config CRUD
    await upsertCategories(admin.token, categories);
    const appendedCategory = { id: `test-${t}`, label: "测试", labelEn: "Test", icon: "science" };
    await upsertCategories(admin.token, [...categories, appendedCategory]);
    const gotCategories = await readCategories(admin.token);
    const catShapeOk = gotCategories.every(
      (c: any) => typeof c?.id === "string" && typeof c?.label === "string" && typeof c?.labelEn === "string" && typeof c?.icon === "string",
    );
    const catCrudOk = gotCategories.some((c: any) => c?.id === appendedCategory.id) && gotCategories.length >= 6 && catShapeOk;
    steps.push({
      id: "AC1-systemconfig-categories-crud",
      ok: catCrudOk,
      detail: `count=${gotCategories.length} hasAppended=${gotCategories.some((c: any) => c?.id === appendedCategory.id)} shape=${catShapeOk}`,
    });

    // Fixtures for sorting/rating
    const tplA = await createTemplate(admin.token, adminProjectId, `TL Public A ${t}`, [a1]);
    const tplB = await createTemplate(admin.token, adminProjectId, `TL Public B ${t}`, [a1, a2]);
    const tplC = await createTemplate(admin.token, adminProjectId, `TL Public C ${t}`, [a2]);
    context.templates = { tplA, tplB, tplC };

    await setTemplatePublic(admin.token, tplA, targetCategory, 95);
    await setTemplatePublic(admin.token, tplB, "writing", 80);
    await setTemplatePublic(admin.token, tplC, "analysis", 60);

    // Create fork count asymmetry for popular sort
    await api(`/api/projects/${userProjectId}/templates/fork`, {
      method: "POST",
      expect: [200, 201],
      headers: { Authorization: `Bearer ${user.token}` },
      body: JSON.stringify({ sourceTemplateId: tplA }),
    });
    await api(`/api/projects/${userProjectId}/templates/fork`, {
      method: "POST",
      expect: [200, 201],
      headers: { Authorization: `Bearer ${user.token}` },
      body: JSON.stringify({ sourceTemplateId: tplA }),
    });
    await api(`/api/projects/${userProjectId}/templates/fork`, {
      method: "POST",
      expect: [200, 201],
      headers: { Authorization: `Bearer ${user.token}` },
      body: JSON.stringify({ sourceTemplateId: tplB }),
    });

    // AC2: list payload includes category/rating fields
    const listBase = await listPublicTemplates(user.token, { search: t, sort_by: "recommended", sort: "qualityScore" });
    const rowA = listBase.rows.find((r) => r.id === tplA);
    const hasCategoryFields = Boolean(rowA?.category || rowA?.categoryIcon);
    const hasRatingFields = rowA?.averageScore !== null || rowA?.ratingCount !== null;
    steps.push({
      id: "AC2-public-template-category-rating-payload",
      ok: Boolean(rowA) && hasCategoryFields && hasRatingFields,
      detail: `api=${listBase.path} found=${Boolean(rowA)} category=${rowA?.category ?? "none"} categoryIcon=${rowA?.categoryIcon ?? "none"} avg=${String(rowA?.averageScore)} count=${String(rowA?.ratingCount)}`,
    });

    // AC3: category filter
    const listMatch = await listPublicTemplates(user.token, { search: t, category: targetCategory });
    const listMismatch = await listPublicTemplates(user.token, { search: t, category: "translation" });
    const inMatch = listMatch.rows.some((r) => r.id === tplA);
    const outMismatch = !listMismatch.rows.some((r) => r.id === tplA);
    steps.push({
      id: "AC3-category-filter",
      ok: inMatch && outMismatch,
      detail: `matchPath=${listMatch.path} mismatchPath=${listMismatch.path} inMatch=${inMatch} outMismatch=${outMismatch}`,
    });

    // AC4: sort switching
    const popular = await listPublicTemplates(user.token, { search: t, sort_by: "popular" });
    const topRated = await listPublicTemplates(user.token, { search: t, sort_by: "top_rated" });
    const latest = await listPublicTemplates(user.token, { search: t, sort_by: "latest" });
    const recommended = await listPublicTemplates(user.token, { search: t, sort_by: "recommended" });

    const popForks = popular.rows.slice(0, 2).map((r) => r.forkCount ?? -1);
    const popularLooksSorted = popForks.length >= 2 ? popForks[0] >= popForks[1] : false;

    const topScores = topRated.rows.slice(0, 2).map((r) => r.averageScore ?? -1);
    const topRatedLooksSorted = topScores.length >= 2 ? topScores[0] >= topScores[1] : false;

    const latestTimes = latest.rows.slice(0, 2).map((r) => Date.parse(r.updatedAt || "1970-01-01"));
    const latestLooksSorted = latestTimes.length >= 2 ? latestTimes[0] >= latestTimes[1] : false;

    const sortAccepted =
      popular.rows.length > 0 && topRated.rows.length > 0 && latest.rows.length > 0 && recommended.rows.length > 0;

    steps.push({
      id: "AC4-sort-by-four-modes",
      ok: sortAccepted && popularLooksSorted && topRatedLooksSorted && latestLooksSorted,
      detail: `sortAccepted=${sortAccepted} popularSorted=${popularLooksSorted} topRatedSorted=${topRatedLooksSorted} latestSorted=${latestLooksSorted}`,
    });

    // AC5/AC6: rate + overwrite
    const rate1 = await api(`/api/templates/${tplA}/rate`, {
      method: "POST",
      expect: [200, 201],
      headers: { Authorization: `Bearer ${user.token}` },
      body: JSON.stringify({ score: 4 }),
    });
    const avg1 = toNum(rate1.body?.averageScore ?? rate1.body?.data?.averageScore);
    const cnt1 = toNum(rate1.body?.ratingCount ?? rate1.body?.data?.ratingCount);

    const rate2 = await api(`/api/templates/${tplA}/rate`, {
      method: "POST",
      expect: [200, 201],
      headers: { Authorization: `Bearer ${user.token}` },
      body: JSON.stringify({ score: 2 }),
    });
    const avg2 = toNum(rate2.body?.averageScore ?? rate2.body?.data?.averageScore);
    const cnt2 = toNum(rate2.body?.ratingCount ?? rate2.body?.data?.ratingCount);

    const ac5 = avg1 !== null && cnt1 !== null;
    const ac6 = cnt1 !== null && cnt2 !== null && cnt2 === cnt1 && avg2 !== null && avg1 !== null && avg2 !== avg1;

    steps.push({
      id: "AC5-rate-api-aggregate-update",
      ok: ac5,
      detail: `status1=${rate1.status} avg1=${String(avg1)} count1=${String(cnt1)}`,
    });
    steps.push({
      id: "AC6-rerate-overwrite",
      ok: ac6,
      detail: `status2=${rate2.status} avg1=${String(avg1)} avg2=${String(avg2)} count1=${String(cnt1)} count2=${String(cnt2)}`,
    });

    // AC7: MCP category/sort_by params
    const mcpKey = await createApiKey(user.token, userProjectId, `tl-mcp-key-${t}`);
    const init = await rawMcpWithFallback(mcpKey, "initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "codex-tl-verifier", version: "1.0.0" },
    });
    const tools = await rawMcpWithFallback(mcpKey, "tools/list", {});
    const listTool = (tools.body?.result?.tools ?? []).find((x: any) => x?.name === "list_public_templates");
    const props = listTool?.inputSchema?.properties ?? listTool?.inputSchema?.schema?.properties ?? {};
    const hasCategoryArg = Object.prototype.hasOwnProperty.call(props, "category");
    const hasSortByArg = Object.prototype.hasOwnProperty.call(props, "sort_by");

    const mcpList = parseMcpToolJson(
      await callMcpTool(mcpKey, "list_public_templates", {
        search: t,
        category: targetCategory,
        sort_by: "popular",
      }),
    );
    const mcpRows = Array.isArray(mcpList?.templates) ? mcpList.templates : [];
    const mcpFound = mcpRows.some((r: any) => String(r?.id) === tplA);

    steps.push({
      id: "AC7-mcp-list-public-templates-category-sort",
      ok: init.status === 200 && hasCategoryArg && hasSortByArg && mcpFound,
      detail: `mcpPath=${init.path} init=${init.status} hasCategoryArg=${hasCategoryArg} hasSortByArg=${hasSortByArg} found=${mcpFound}`,
    });

    // AC8: UI static assertions for category/sort/rating dialog wiring
    const templatesDir = "src/app/(console)/templates";
    const adminDir = "src/app/(console)/admin";
    const templatesText = readAllFilesUnder(templatesDir, [".ts", ".tsx"]);
    const adminText = readAllFilesUnder(adminDir, [".ts", ".tsx"]);

    const uiHasCategory = /category/i.test(templatesText) && /TEMPLATE_CATEGORIES|templateCategories|categories/i.test(adminText + templatesText);
    const uiHasSortModes = /recommended/i.test(templatesText) && /popular/i.test(templatesText) && /top_rated|topRated/i.test(templatesText) && /latest/i.test(templatesText);
    const uiHasRating = /averageScore|ratingCount|rate\b|stars?|score/i.test(templatesText);
    const uiHasForkRateFlow = /fork/i.test(templatesText) && /\/api\/templates\/.+\/rate|templates\/\$\{.*\}\/rate|templates\/.+\/rate/i.test(templatesText);

    steps.push({
      id: "AC8-ui-static-readiness",
      ok: uiHasCategory && uiHasSortModes && uiHasRating && uiHasForkRateFlow,
      detail: `category=${uiHasCategory} sortModes=${uiHasSortModes} rating=${uiHasRating} forkRateFlow=${uiHasForkRateFlow}`,
    });

    const passCount = steps.filter((s) => s.ok).length;
    const failCount = steps.length - passCount;

    writeFileSync(
      OUTPUT,
      JSON.stringify(
        {
          batch: "TEMPLATE-LIBRARY-UPGRADE",
          baseUrl: BASE,
          generatedAt: new Date().toISOString(),
          passCount,
          failCount,
          context,
          steps,
        },
        null,
        2,
      ),
    );

    if (failCount > 0) {
      console.error(`[template-library-upgrade-verifying] failed: ${failCount} step(s)`);
      process.exit(1);
    }
  } catch (err) {
    writeFileSync(
      OUTPUT,
      JSON.stringify(
        {
          batch: "TEMPLATE-LIBRARY-UPGRADE",
          baseUrl: BASE,
          generatedAt: new Date().toISOString(),
          passCount: 0,
          failCount: 1,
          steps: [
            {
              id: "runtime",
              ok: false,
              detail: asErr(err),
            },
          ],
        },
        null,
        2,
      ),
    );
    console.error(`[template-library-upgrade-verifying] runtime error: ${asErr(err)}`);
    process.exit(1);
  }
}

void run();
