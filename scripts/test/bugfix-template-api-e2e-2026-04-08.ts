import { writeFileSync } from "fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3099";
const OUTPUT =
  process.env.OUTPUT_FILE ?? "docs/test-reports/bugfix-template-api-e2e-2026-04-08.json";

interface StepResult {
  name: string;
  ok: boolean;
  detail?: string;
}

async function api(path: string, init?: RequestInit & { expect?: number }) {
  const { expect, ...rest } = init ?? {};
  const res = await fetch(`${BASE}${path}`, rest);
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
  return { status: res.status, body };
}

async function login(email: string, password: string) {
  const res = await api("/api/auth/login", {
    method: "POST",
    expect: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return res.body;
}

async function main() {
  const steps: StepResult[] = [];
  const email = process.env.TEST_EMAIL ?? "codex-admin@aigc-gateway.local";
  const password = process.env.TEST_PASSWORD ?? "Codex@2026!";
  const auth = await login(email, password);
  const token = auth.token as string;
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const projects = await api("/api/projects", { headers, expect: 200 });
  const projectId = projects.body?.data?.[0]?.id;
  if (!projectId) throw new Error("no project found");

  // create valid template
  const createBody = {
    name: "Codex Template",
    actionId: null,
    steps: [
      { order: 1, actionId: null, prompt: "foo" },
      { order: 2, actionId: null, prompt: "bar" },
    ],
  };
  const created = await api(`/api/projects/${projectId}/templates`, {
    method: "POST",
    headers,
    expect: 201,
    body: JSON.stringify(createBody),
  });
  const templateId = created.body?.id;
  steps.push({ name: "create baseline template", ok: true, detail: templateId });

  // Missing order validation
  try {
    await api(`/api/projects/${projectId}/templates`, {
      method: "POST",
      headers,
      expect: 400,
      body: JSON.stringify({ name: "Bad", steps: [{ prompt: "missing" }] }),
    });
    steps.push({ name: "missing order validation", ok: true });
  } catch (error) {
    steps.push({ name: "missing order validation", ok: false, detail: (error as Error).message });
  }

  // Duplicate order update
  try {
    await api(`/api/projects/${projectId}/templates/${templateId}`, {
      method: "PUT",
      headers,
      expect: 400,
      body: JSON.stringify({ steps: [{ order: 1, prompt: "a" }, { order: 1, prompt: "b" }] }),
    });
    steps.push({ name: "duplicate order update", ok: true });
  } catch (error) {
    steps.push({ name: "duplicate order update", ok: false, detail: (error as Error).message });
  }

  // MCP tool error handling
  const apiKeyRes = await api(`/api/projects/${projectId}/keys`, {
    method: "POST",
    headers,
    expect: 201,
    body: JSON.stringify({ name: "codex-upsert" }),
  });
  const apiKey = apiKeyRes.body?.key;
  if (!apiKey) throw new Error("api key missing");

  const mcpRes = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: {
        name: "create_template",
        arguments: { name: "MCP Bad", steps: [{ prompt: "missing order" }] },
      },
    }),
  });
  const mcpText = await mcpRes.text();
  const mcpJson = JSON.parse(mcpText.startsWith("{") ? mcpText : mcpText.split("data:").pop()!);
  const isError = mcpJson?.result?.isError || mcpJson?.error;
  steps.push({ name: "mcp create_template error", ok: Boolean(isError), detail: mcpText });

  writeFileSync(OUTPUT, JSON.stringify({ projectId, templateId, steps }, null, 2));
}

main().catch((error) => {
  console.error("[bugfix-template-api]", error.message);
  process.exit(1);
});
