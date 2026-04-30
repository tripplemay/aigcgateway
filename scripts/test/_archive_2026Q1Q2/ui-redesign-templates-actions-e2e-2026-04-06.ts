import { writeFileSync } from "fs";
import { requireEnv } from "../lib/require-env";

const BASE = process.env.BASE_URL ?? "http://localhost:3199";
const OUTPUT_FILE =
  process.env.OUTPUT_FILE ??
  "docs/test-reports/ui-redesign-templates-actions-local-e2e-2026-04-06.json";

type StepResult = {
  name: string;
  ok: boolean;
  detail?: string;
};

let userToken = "";
let adminToken = "";
let projectId = "";
let actionId = "";
let templateId = "";

const testUser = {
  email: `ui_redesign_${Date.now()}@test.com`,
  password: requireEnv("E2E_TEST_PASSWORD"),
  name: "UI Redesign Tester",
};

async function api(
  path: string,
  init?: RequestInit & { expect?: number; auth?: "user" | "admin" | "none" },
) {
  const { expect, auth = "none", ...rest } = init ?? {};
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(rest.headers as Record<string, string> | undefined),
  };
  if (auth === "user" && userToken) headers.Authorization = `Bearer ${userToken}`;
  if (auth === "admin" && adminToken) headers.Authorization = `Bearer ${adminToken}`;
  const res = await fetch(`${BASE}${path}`, { ...rest, headers });
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
  return { res, body, text };
}

async function step(name: string, results: StepResult[], fn: () => Promise<string | undefined>) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
  } catch (error) {
    results.push({ name, ok: false, detail: (error as Error).message });
  }
}

async function setupAuthAndData() {
  await api("/api/auth/register", {
    method: "POST",
    auth: "none",
    expect: 201,
    body: JSON.stringify(testUser),
  });
  const login = await api("/api/auth/login", {
    method: "POST",
    auth: "none",
    expect: 200,
    body: JSON.stringify({ email: testUser.email, password: testUser.password }),
  });
  userToken = String(login.body?.token ?? "");
  if (!userToken) throw new Error("user token missing");

  const adminLogin = await api("/api/auth/login", {
    method: "POST",
    auth: "none",
    expect: 200,
    body: JSON.stringify({ email: "admin@aigc-gateway.local", password: requireEnv("ADMIN_TEST_PASSWORD") }),
  });
  adminToken = String(adminLogin.body?.token ?? "");
  if (!adminToken) throw new Error("admin token missing");

  const project = await api("/api/projects", {
    method: "POST",
    auth: "user",
    expect: 201,
    body: JSON.stringify({ name: `UI Redesign Project ${Date.now()}` }),
  });
  projectId = String(project.body?.id ?? "");
  if (!projectId) throw new Error("project id missing");
}

async function main() {
  const results: StepResult[] = [];
  await setupAuthAndData();

  await step("F-UI API: create action", results, async () => {
    const res = await api(`/api/projects/${projectId}/actions`, {
      method: "POST",
      auth: "user",
      expect: 201,
      body: JSON.stringify({
        name: "UI Test Action",
        description: "Action for UI redesign validation",
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: "hello {{topic}}" }],
        variables: [{ name: "topic", description: "topic", required: true }],
        changelog: "init",
      }),
    });
    actionId = String(res.body?.id ?? "");
    if (!actionId) throw new Error("action id missing");
    return actionId;
  });

  await step("F-UI API: actions list/detail/update", results, async () => {
    const list = await api(`/api/projects/${projectId}/actions?page=1&pageSize=20`, {
      method: "GET",
      auth: "user",
      expect: 200,
    });
    const found = (list.body?.data ?? []).find((a: any) => a.id === actionId);
    if (!found) throw new Error("action not found in list");

    const detail = await api(`/api/projects/${projectId}/actions/${actionId}`, {
      method: "GET",
      auth: "user",
      expect: 200,
    });
    if (!Array.isArray(detail.body?.versions) || detail.body.versions.length === 0) {
      throw new Error("action detail missing versions");
    }

    const updatedName = "UI Test Action Updated";
    const updated = await api(`/api/projects/${projectId}/actions/${actionId}`, {
      method: "PUT",
      auth: "user",
      expect: 200,
      body: JSON.stringify({ name: updatedName }),
    });
    if (updated.body?.name !== updatedName) throw new Error("action update failed");
    return updatedName;
  });

  await step("F-UI API: create template", results, async () => {
    const res = await api(`/api/projects/${projectId}/templates`, {
      method: "POST",
      auth: "user",
      expect: 201,
      body: JSON.stringify({
        name: "UI Test Template",
        description: "Template for UI redesign validation",
        steps: [{ actionId, order: 0, role: "SEQUENTIAL" }],
      }),
    });
    templateId = String(res.body?.id ?? "");
    if (!templateId) throw new Error("template id missing");
    return templateId;
  });

  await step("F-UI API: templates list/detail/update/delete", results, async () => {
    const list = await api(`/api/projects/${projectId}/templates?page=1&pageSize=20`, {
      method: "GET",
      auth: "user",
      expect: 200,
    });
    const found = (list.body?.data ?? []).find((t: any) => t.id === templateId);
    if (!found) throw new Error("template not found in list");
    if (typeof found.stepCount !== "number") throw new Error("template stepCount missing");
    if (!["single", "sequential", "fan-out"].includes(String(found.executionMode))) {
      throw new Error(`unexpected executionMode: ${found.executionMode}`);
    }

    const detail = await api(`/api/projects/${projectId}/templates/${templateId}`, {
      method: "GET",
      auth: "user",
      expect: 200,
    });
    if (!Array.isArray(detail.body?.steps) || detail.body.steps.length !== 1) {
      throw new Error("template detail missing steps");
    }

    const updated = await api(`/api/projects/${projectId}/templates/${templateId}`, {
      method: "PUT",
      auth: "user",
      expect: 200,
      body: JSON.stringify({
        name: "UI Test Template Updated",
        description: "updated",
        steps: [{ actionId, order: 0, role: "SEQUENTIAL" }],
      }),
    });
    if (updated.body?.name !== "UI Test Template Updated") throw new Error("template update failed");

    await api(`/api/projects/${projectId}/templates/${templateId}`, {
      method: "DELETE",
      auth: "user",
      expect: 200,
    });

    await api(`/api/projects/${projectId}/actions/${actionId}`, {
      method: "DELETE",
      auth: "user",
      expect: 200,
    });
    return "template/action delete ok";
  });

  await step("F-UI API: admin templates endpoint", results, async () => {
    const res = await api("/api/admin/templates?page=1&pageSize=20", {
      method: "GET",
      auth: "admin",
      expect: 200,
    });
    if (!Array.isArray(res.body?.data)) throw new Error("admin templates data missing");
    if (!res.body?.stats || typeof res.body.stats.totalTemplates !== "number") {
      throw new Error("admin templates stats missing");
    }
    return `totalTemplates=${res.body.stats.totalTemplates}`;
  });

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  const summary = {
    passed,
    failed,
    results,
    testUser,
    projectId,
    notes: "Use testUser credentials for manual/browser checks on redesigned pages.",
  };
  writeFileSync(OUTPUT_FILE, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  const fatal = { fatal: (error as Error).message };
  try {
    writeFileSync(OUTPUT_FILE, JSON.stringify(fatal, null, 2));
  } catch {}
  console.error(error);
  process.exit(1);
});
