import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE_URL ?? "http://localhost:3099";
const prisma = new PrismaClient({
  datasourceUrl:
    process.env.TEST_DATABASE_URL ?? "postgresql://test:test@localhost:5432/aigc_gateway_test",
});

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...(init ?? {}),
    headers: {
      "Content-Type": "application/json",
      ...((init?.headers as Record<string, string> | undefined) ?? {}),
    },
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  return { status: res.status, body, text };
}

async function callMcp(apiKey: string, method: string, params: Record<string, unknown>) {
  const r = await fetch(`${BASE}/api/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });
  const text = await r.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  return { status: r.status, body, text };
}

async function main() {
  const tag = Date.now().toString(36);
  const email = `sp14_${tag}@test.local`;
  const password = "SP14_Test_1234";

  await api("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, name: `sp14-${tag}` }),
  });
  const login = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (login.status !== 200 || !login.body?.token) {
    throw new Error(`login failed: ${login.status} ${login.text}`);
  }
  const token = String(login.body.token);

  const createProject = await api("/api/projects", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: `SP14 Project ${tag}` }),
  });
  if (createProject.status !== 201 || !createProject.body?.id) {
    throw new Error(`create project failed: ${createProject.status} ${createProject.text}`);
  }
  const projectId = String(createProject.body.id);

  const createAction = await api(`/api/projects/${projectId}/actions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: `sp14-action-${tag}`,
      description: "sp14 action",
      model: "deepseek/v3",
      messages: [{ role: "user", content: "Say hello to {{name}}" }],
      variables: [{ name: "name", required: true }],
      changelog: "init",
    }),
  });
  if (createAction.status !== 201 || !createAction.body?.id) {
    throw new Error(`create action failed: ${createAction.status} ${createAction.text}`);
  }
  const actionId = String(createAction.body.id);

  const createTemplate = await api(`/api/projects/${projectId}/templates`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: `sp14-template-${tag}`,
      description: "sp14 template",
      steps: [{ actionId, order: 0, role: "SEQUENTIAL" }],
    }),
  });
  if (createTemplate.status !== 201 || !createTemplate.body?.id) {
    throw new Error(`create template failed: ${createTemplate.status} ${createTemplate.text}`);
  }
  const templateId = String(createTemplate.body.id);

  const createKey = await api("/api/keys", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: `sp14-key-${tag}`,
      rateLimit: 1,
      permissions: { chatCompletion: true },
    }),
  });
  if (createKey.status !== 201 || !createKey.body?.key) {
    throw new Error(`create key failed: ${createKey.status} ${createKey.text}`);
  }
  const apiKey = String(createKey.body.key);

  // Ensure user has positive balance (run_template checks user.balance > 0).
  await prisma.user.update({
    where: { email },
    data: { balance: 10 },
  });

  const first = await callMcp(apiKey, "tools/call", {
    name: "run_template",
    arguments: {
      template_id: templateId,
      variables: { name: "first" },
      test_mode: "execute",
    },
  });

  const second = await callMcp(apiKey, "tools/call", {
    name: "run_template",
    arguments: {
      template_id: templateId,
      variables: { name: "second" },
      test_mode: "execute",
    },
  });

  const secondText = JSON.stringify(second.body);
  const secondIsRateLimited =
    second.status === 429 ||
    secondText.includes("Rate limit exceeded") ||
    secondText.includes("too_many_requests") ||
    secondText.includes("rate_limit_exceeded");

  const out = {
    generatedAt: new Date().toISOString(),
    base: BASE,
    user: email,
    templateId,
    first: {
      status: first.status,
      body: first.body,
    },
    second: {
      status: second.status,
      body: second.body,
    },
    secondIsRateLimited,
    strict429: second.status === 429,
  };

  console.log(JSON.stringify(out, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
