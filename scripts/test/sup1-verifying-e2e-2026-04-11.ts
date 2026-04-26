import { writeFileSync, readFileSync } from "fs";
import { spawnSync } from "child_process";
import { PrismaClient } from "@prisma/client";
import { requireEnv } from "../lib/require-env";

const BASE = process.env.BASE_URL ?? "http://localhost:3199";
const OUTPUT = process.env.OUTPUT_FILE ?? "docs/test-reports/sup1-verifying-e2e-2026-04-11.json";

const prisma = new PrismaClient();

type Step = { id: string; ok: boolean; detail: string };
type ApiRes = { status: number; body: any; text: string };

let userToken = "";
let userId = "";
let projectId = "";

function unique(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

async function api(
  path: string,
  init?: RequestInit & {
    expect?: number;
    auth?: "none" | "jwt" | "key";
    key?: string;
    project?: string;
  },
): Promise<ApiRes> {
  const { expect, auth = "none", key, project, ...rest } = init ?? {};
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(rest.headers as Record<string, string> | undefined),
  };

  if (auth === "jwt" && userToken) headers.authorization = `Bearer ${userToken}`;
  if (auth === "key" && key) headers.authorization = `Bearer ${key}`;
  if (project) headers["x-project-id"] = project;

  const res = await fetch(`${BASE}${path}`, { ...rest, headers, redirect: "manual" });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (typeof expect === "number" && res.status !== expect) {
    throw new Error(`${path} expected ${expect}, got ${res.status}: ${JSON.stringify(body)}`);
  }
  return { status: res.status, body, text };
}

async function registerAndLogin(): Promise<{ email: string; token: string; userId: string }> {
  const email = `${unique("sup1_user")}@test.local`;
  const password = requireEnv("E2E_TEST_PASSWORD");

  await api("/api/auth/register", {
    method: "POST",
    auth: "none",
    expect: 201,
    body: JSON.stringify({ email, password, name: "SUP1 User" }),
  });

  const login = await api("/api/auth/login", {
    method: "POST",
    auth: "none",
    expect: 200,
    body: JSON.stringify({ email, password }),
  });

  const uid = String(login.body?.user?.id ?? "");
  const token = String(login.body?.token ?? "");
  if (!uid || !token) throw new Error("register/login did not return user id + token");

  return { email, token, userId: uid };
}

async function createApiKey(rateLimit: number): Promise<string> {
  const res = await api("/api/keys", {
    method: "POST",
    auth: "jwt",
    expect: 201,
    body: JSON.stringify({ name: unique("sup1-key"), rateLimit }),
  });
  const raw = String(res.body?.key ?? "");
  if (!raw) throw new Error("raw api key missing");
  return raw;
}

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function runJwtSecretCheck(shortSecret: boolean): { ok: boolean; detail: string } {
  const code = `
    import { signJwt } from './src/lib/api/jwt-middleware';
    try {
      const token = signJwt({ userId: 'u_test', role: 'DEVELOPER' });
      console.log('OK:' + token.slice(0, 12));
    } catch (e) {
      console.log('ERR:' + (e instanceof Error ? e.message : String(e)));
      process.exit(7);
    }
  `;

  const env = {
    ...process.env,
    JWT_SECRET: shortSecret ? "short-secret" : "long-enough-jwt-secret-2026",
    DATABASE_URL:
      process.env.DATABASE_URL ?? "postgresql://test:test@localhost:5432/aigc_gateway_test",
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY ?? "12345678901234567890123456789012",
    NODE_ENV: "test",
  } as NodeJS.ProcessEnv;

  const r = spawnSync("npx", ["tsx", "-e", code], {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
  });

  const out = `${r.stdout || ""}${r.stderr || ""}`.trim();
  if (shortSecret) {
    return {
      ok: r.status !== 0 && /JWT_SECRET/.test(out),
      detail: `exit=${r.status} output=${out.slice(0, 220)}`,
    };
  }

  return {
    ok: r.status === 0 && /OK:/.test(out),
    detail: `exit=${r.status} output=${out.slice(0, 220)}`,
  };
}

async function main() {
  const steps: Step[] = [];

  const id = await registerAndLogin();
  userToken = id.token;
  userId = id.userId;

  // Ensure L1 test calls are not blocked by insufficient balance
  await prisma.user.update({
    where: { id: userId },
    data: { balance: 1000 },
  });

  // BL-094 project duplicate check
  const pn = unique("dup-project");
  const p1 = await api("/api/projects", {
    method: "POST",
    auth: "jwt",
    expect: 201,
    body: JSON.stringify({ name: pn }),
  });
  projectId = String(p1.body?.id ?? "");
  const p2 = await api("/api/projects", {
    method: "POST",
    auth: "jwt",
    body: JSON.stringify({ name: pn }),
  });
  steps.push({
    id: "F-SUP1-06-duplicate-project-409",
    ok: p2.status === 409,
    detail: `first=${p1.status}, second=${p2.status}, code=${p2.body?.error?.code ?? "-"}`,
  });

  // BL-070 email verify anti-forgery + expiry
  const emailA = `${unique("verify_a")}@test.local`;
  const emailB = `${unique("verify_b")}@test.local`;
  const pwd = requireEnv("E2E_TEST_PASSWORD");

  const regA = await api("/api/auth/register", {
    method: "POST",
    auth: "none",
    expect: 201,
    body: JSON.stringify({ email: emailA, password: pwd, name: "Verify A" }),
  });
  const tokenA = String(regA.body?.verificationToken ?? "");

  const missing = await api("/api/auth/verify-email", {
    method: "POST",
    auth: "none",
    body: JSON.stringify({ userId }),
  });
  const invalid = await api("/api/auth/verify-email", {
    method: "POST",
    auth: "none",
    body: JSON.stringify({ token: "invalid-token" }),
  });
  const valid = await api("/api/auth/verify-email", {
    method: "POST",
    auth: "none",
    body: JSON.stringify({ token: tokenA }),
  });
  const reused = await api("/api/auth/verify-email", {
    method: "POST",
    auth: "none",
    body: JSON.stringify({ token: tokenA }),
  });

  const regB = await api("/api/auth/register", {
    method: "POST",
    auth: "none",
    expect: 201,
    body: JSON.stringify({ email: emailB, password: pwd, name: "Verify B" }),
  });
  const tokenBFromBody = String(regB.body?.verificationToken ?? "");
  const userB = await prisma.user.findUnique({
    where: { email: emailB },
    select: {
      emailVerificationTokens: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, token: true },
      },
    },
  });
  const tokenB = tokenBFromBody || String(userB?.emailVerificationTokens?.[0]?.token ?? "");
  const tokenBId = String(userB?.emailVerificationTokens?.[0]?.id ?? "");
  if (!tokenB || !tokenBId) {
    throw new Error("failed to resolve verification token for expired-token test");
  }
  await prisma.emailVerificationToken.update({
    where: { id: tokenBId },
    data: { expiresAt: new Date(Date.now() - 60_000) },
  });
  const expired = await api("/api/auth/verify-email", {
    method: "POST",
    auth: "none",
    body: JSON.stringify({ token: tokenB }),
  });

  steps.push({
    id: "F-SUP1-01-email-token-validation",
    ok:
      missing.status === 400 &&
      invalid.status === 400 &&
      valid.status === 200 &&
      reused.status === 400 &&
      expired.status === 400,
    detail: `missing=${missing.status}, invalid=${invalid.status}, valid=${valid.status}, reused=${reused.status}, expired=${expired.status}`,
  });

  // BL-071 JWT secret guard (short secret should fail; normal secret should succeed)
  const shortCheck = runJwtSecretCheck(true);
  const okCheck = runJwtSecretCheck(false);
  steps.push({
    id: "F-SUP1-02-jwt-secret-guard",
    ok: shortCheck.ok && okCheck.ok,
    detail: `short=[${shortCheck.detail}] normal=[${okCheck.detail}]`,
  });

  // BL-072 rollback checks per route (fresh key per route to avoid cross contamination)
  async function twoCalls(path: string, body: any, isImage = false) {
    const key = await createApiKey(1);
    const first = await api(path, {
      method: "POST",
      auth: "key",
      key,
      project: projectId,
      body: JSON.stringify(body),
    });
    const second = await api(path, {
      method: "POST",
      auth: "key",
      key,
      project: projectId,
      body: JSON.stringify(body),
    });
    const not429 = first.status !== 429 && second.status !== 429;
    return {
      ok: not429,
      detail: `first=${first.status} second=${second.status}${isImage ? " (image)" : ""}`,
    };
  }

  const chatRollback = await twoCalls("/v1/chat/completions", {
    model: "openai/not-exist-model",
    messages: [{ role: "user", content: "hi" }],
  });
  const imageRollback = await twoCalls(
    "/v1/images/generations",
    {
      model: "openai/not-exist-image-model",
      prompt: "test",
    },
    true,
  );
  const actionRollback = await twoCalls("/v1/actions/run", {
    action_id: "cm_fake_action_id",
    stream: false,
  });
  const templateRollback = await twoCalls("/v1/templates/run", {
    template_id: "cm_fake_template_id",
    stream: false,
  });

  steps.push({
    id: "F-SUP1-03-rate-limit-rollback-chat",
    ok: chatRollback.ok,
    detail: chatRollback.detail,
  });
  steps.push({
    id: "F-SUP1-03-rate-limit-rollback-image",
    ok: imageRollback.ok,
    detail: imageRollback.detail,
  });
  steps.push({
    id: "F-SUP1-03-rate-limit-rollback-action",
    ok: actionRollback.ok,
    detail: actionRollback.detail,
  });
  steps.push({
    id: "F-SUP1-03-rate-limit-rollback-template",
    ok: templateRollback.ok,
    detail: templateRollback.detail,
  });

  // BL-105 static UI cleanup checks
  const cleanupChecks: Array<{ file: string; absent: string[]; present?: string[] }> = [
    {
      file: "src/app/(console)/logs/page.tsx",
      absent: ["Cost Optimization"],
    },
    {
      file: "src/app/(console)/keys/page.tsx",
      absent: ["Coming Soon"],
    },
    {
      file: "src/app/(console)/mcp-setup/page.tsx",
      absent: ["Feature Showcase"],
    },
    {
      file: "src/app/(console)/admin/models/page.tsx",
      absent: ["Pricing Drift"],
    },
    {
      file: "src/app/(auth)/login/page.tsx",
      absent: ['href="#"'],
      present: ["Google", "GitHub", 'href="/register"'],
    },
    {
      file: "src/app/(auth)/register/page.tsx",
      absent: ['href="#"'],
      present: ["Google", "GitHub", 'href="/login"'],
    },
  ];

  const cleanupFails: string[] = [];
  for (const c of cleanupChecks) {
    const content = read(c.file);
    for (const a of c.absent) {
      if (content.includes(a)) cleanupFails.push(`${c.file} still contains '${a}'`);
    }
    for (const p of c.present ?? []) {
      if (!content.includes(p)) cleanupFails.push(`${c.file} missing '${p}'`);
    }
  }
  steps.push({
    id: "F-SUP1-04-ui-cleanup-static-check",
    ok: cleanupFails.length === 0,
    detail: cleanupFails.length ? cleanupFails.join(" | ") : "all static checks passed",
  });

  // BL-103 thousand-separator checks (static)
  const thousandChecks: Array<{ file: string; mustContain: string[] }> = [
    {
      file: "src/app/(console)/dashboard/page.tsx",
      mustContain: ["usage.totalCalls.toLocaleString()", "usage.avgLatencyMs?.toLocaleString()"],
    },
    {
      file: "src/app/(console)/usage/page.tsx",
      mustContain: ["avgLatencyMs ?? 0).toLocaleString()"],
    },
    {
      file: "src/app/(console)/logs/page.tsx",
      mustContain: ["l.latencyMs.toLocaleString()", "l.totalTokens.toLocaleString()"],
    },
    {
      file: "src/app/(console)/admin/logs/page.tsx",
      mustContain: ["l.promptTokens?.toLocaleString()", "l.completionTokens?.toLocaleString()"],
    },
    {
      file: "src/app/(console)/admin/health/page.tsx",
      mustContain: ["summary.avgLatency.toLocaleString()"],
    },
    {
      file: "src/app/(console)/settings/page.tsx",
      mustContain: ["projectDetail?.stats.callCount?.toLocaleString()"],
    },
    { file: "src/app/(console)/admin/model-aliases/page.tsx", mustContain: ["toLocaleString()"] },
    { file: "src/app/(console)/models/page.tsx", mustContain: ["toLocaleString()"] },
  ];

  const thousandMisses: string[] = [];
  for (const c of thousandChecks) {
    const content = read(c.file);
    for (const m of c.mustContain) {
      if (!content.includes(m)) thousandMisses.push(`${c.file} missing '${m}'`);
    }
  }
  steps.push({
    id: "F-SUP1-05-thousand-separator-static-check",
    ok: thousandMisses.length === 0,
    detail: thousandMisses.length
      ? thousandMisses.join(" | ")
      : "all required toLocaleString checks present",
  });

  const pass = steps.filter((s) => s.ok).length;
  const fail = steps.length - pass;

  const result = {
    batch: "SUP1-security-ui-polish",
    executedAt: new Date().toISOString(),
    baseUrl: BASE,
    pass,
    fail,
    steps,
  };

  writeFileSync(OUTPUT, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(result, null, 2));

  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
