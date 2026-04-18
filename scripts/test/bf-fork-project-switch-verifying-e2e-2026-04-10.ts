import { writeFileSync, readFileSync } from "fs";
import { requireEnv } from "../lib/require-env";

const BASE = process.env.BASE_URL ?? "http://localhost:3099";
const OUTPUT =
  process.env.OUTPUT_FILE ?? "docs/test-reports/bf-fork-project-switch-verifying-e2e-2026-04-10.json";

type Step = { id: string; name: string; ok: boolean; detail: string };
type ApiResult = { status: number; body: any; text: string };

function nowTag() {
  return Date.now().toString(36);
}

function read(path: string) {
  return readFileSync(path, "utf8");
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

async function loginAdmin(): Promise<string> {
  const candidates = [
    { email: "admin@aigc-gateway.local", password: requireEnv("ADMIN_TEST_PASSWORD") },
    { email: "codex-admin@aigc-gateway.local", password: requireEnv("ADMIN_TEST_PASSWORD") },
  ];
  for (const c of candidates) {
    try {
      const token = await login(c.email, c.password);
      if (token) return token;
    } catch {
      // try next candidate
    }
  }
  throw new Error("admin login failed for all known test accounts");
}

async function registerAndLoginUser(tag: string) {
  const email = `bf_${tag}@test.local`;
  const password = "BF_Test_1234";
  await api("/api/auth/register", {
    method: "POST",
    expect: 201,
    body: JSON.stringify({ email, password, name: `BF User ${tag}` }),
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

async function run() {
  const steps: Step[] = [];

  const tag = nowTag();
  const adminToken = await loginAdmin();
  const user = await registerAndLoginUser(tag);

  const adminProjectId = await createProject(adminToken, `BF Admin Source ${tag}`);
  const userProjectId = await createProject(user.token, `BF User Target ${tag}`);

  const actionA = await createAction(adminToken, adminProjectId, {
    name: `bf-src-action-a-${tag}`,
    content: "step-a",
  });
  const actionB = await createAction(adminToken, adminProjectId, {
    name: `bf-src-action-b-${tag}`,
    content: "step-b",
  });

  const sourceTemplateId = await createTemplate(adminToken, adminProjectId, {
    name: `BF Source Public ${tag}`,
    actionIds: [actionA, actionB],
  });

  await api(`/api/admin/templates/${sourceTemplateId}`, {
    method: "PATCH",
    expect: 200,
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ isPublic: true, qualityScore: 90 }),
  });

  // AC1: fork public template and ensure each copied action has activeVersionId
  const forkRes = await api(`/api/projects/${userProjectId}/templates/fork`, {
    method: "POST",
    expect: 201,
    headers: { Authorization: `Bearer ${user.token}` },
    body: JSON.stringify({ sourceTemplateId }),
  });
  const forkedTemplateId = String(forkRes.body?.template?.id ?? "");

  const forkedDetail = await api(`/api/projects/${userProjectId}/templates/${forkedTemplateId}`, {
    expect: 200,
    headers: { Authorization: `Bearer ${user.token}` },
  });
  const forkedSteps: any[] = forkedDetail.body?.steps ?? [];
  const forkedActionIds = [...new Set(forkedSteps.map((s) => String(s.actionId)).filter(Boolean))];

  let activeVersionAllSet = true;
  let activeVersionAllResolvable = true;
  const versionMismatches: string[] = [];
  for (const actionId of forkedActionIds) {
    const actionDetail = await api(`/api/projects/${userProjectId}/actions/${actionId}`, {
      expect: 200,
      headers: { Authorization: `Bearer ${user.token}` },
    });
    const activeVersionId = actionDetail.body?.activeVersionId;
    const versions = Array.isArray(actionDetail.body?.versions) ? actionDetail.body.versions : [];
    if (!activeVersionId) activeVersionAllSet = false;
    if (!versions.some((v: any) => v.id === activeVersionId)) {
      activeVersionAllResolvable = false;
      versionMismatches.push(
        `${actionId}:active=${String(activeVersionId ?? "null")},versions=[${versions.map((v: any) => String(v.id)).join(",")}]`,
      );
    }
  }

  const ac1Ok =
    Boolean(forkedTemplateId) &&
    forkedActionIds.length > 0 &&
    activeVersionAllSet &&
    activeVersionAllResolvable;
  steps.push({
    id: "AC1",
    name: "Fork 后 Action 正确设置 activeVersionId 且可解析活跃版本",
    ok: ac1Ok,
    detail: `forkedTemplate=${forkedTemplateId || "none"}, forkedActions=${forkedActionIds.length}, activeVersionAllSet=${activeVersionAllSet}, activeVersionAllResolvable=${activeVersionAllResolvable}, mismatches=${versionMismatches.join(";") || "none"}`,
  });

  // AC1 UI rendering prerequisite check: Action detail page reads activeVersion by id.
  const actionDetailPage = read("src/app/(console)/actions/[actionId]/page.tsx");
  const ac1UiOk =
    actionDetailPage.includes("const activeVersion = action.versions.find((v) => v.id === action.activeVersionId)") &&
    actionDetailPage.includes("{activeVersion && (");
  steps.push({
    id: "AC1-UI",
    name: "Action 详情页基于 activeVersionId 渲染活跃版本",
    ok: ac1UiOk,
    detail: ac1UiOk ? "active-version render path exists" : "missing active-version render path",
  });

  // AC2: project switcher should navigate to dashboard and update selected project id.
  const sidebar = read("src/components/sidebar.tsx");
  const projectHook = read("src/hooks/use-project.tsx");
  const dashboard = read("src/app/(console)/dashboard/page.tsx");

  const hasSelectAndPush =
    sidebar.includes("select(p.id);") &&
    sidebar.includes("setProjectDropdownOpen(false);") &&
    sidebar.includes('router.push("/dashboard")');
  const updatesProjectState =
    projectHook.includes("setCurrent(p);") && projectHook.includes('localStorage.setItem("projectId", p.id);');
  const dashboardRefetchesByCurrent =
    dashboard.includes("const pid = current.id;") &&
    dashboard.includes("`/api/projects/${pid}/usage?period=today`") &&
    dashboard.includes("[current]");

  const ac2Ok = hasSelectAndPush && updatesProjectState && dashboardRefetchesByCurrent;
  steps.push({
    id: "AC2",
    name: "切换项目后跳转 Dashboard，且按 current project 重新拉取数据",
    ok: ac2Ok,
    detail: `hasSelectAndPush=${hasSelectAndPush}, updatesProjectState=${updatesProjectState}, dashboardRefetchesByCurrent=${dashboardRefetchesByCurrent}`,
  });

  // AC3: quick regression - models API still healthy
  const modelsRes = await api("/v1/models", { expect: 200 });
  steps.push({
    id: "AC3",
    name: "回归冒烟：/v1/models 可用",
    ok: modelsRes.status === 200,
    detail: `status=${modelsRes.status}`,
  });

  const passCount = steps.filter((s) => s.ok).length;
  const failCount = steps.length - passCount;

  const result = {
    batch: "bugfix-fork-and-project-switch",
    feature: "F-BF-03",
    executedAt: new Date().toISOString(),
    baseUrl: BASE,
    passCount,
    failCount,
    steps,
  };

  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));

  if (failCount > 0) {
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(result, null, 2));
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
