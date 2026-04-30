import { readFileSync, writeFileSync } from "fs";
import { spawnSync } from "child_process";
import { PrismaClient } from "@prisma/client";
import { requireEnv } from "../lib/require-env";

const BASE = process.env.BASE_URL ?? "http://localhost:3199";
const OUTPUT = process.env.OUTPUT_FILE ?? "docs/test-reports/dq2-verifying-e2e-2026-04-11.json";
const prisma = new PrismaClient();

type Step = { id: string; ok: boolean; detail: string };
type ApiRes = { status: number; body: any; text: string };
type AuthMode = "none" | "admin" | "user";

let adminToken = "";
let userToken = "";
let userId = "";

function uniq(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

async function api(
  path: string,
  init?: RequestInit & { auth?: AuthMode; expect?: number },
): Promise<ApiRes> {
  const { auth = "none", expect, ...rest } = init ?? {};
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(rest.headers as Record<string, string> | undefined),
  };
  if (auth === "admin" && adminToken) headers.authorization = `Bearer ${adminToken}`;
  if (auth === "user" && userToken) headers.authorization = `Bearer ${userToken}`;

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

async function loginAdmin() {
  const res = await api("/api/auth/login", {
    method: "POST",
    auth: "none",
    expect: 200,
    body: JSON.stringify({ email: "admin@aigc-gateway.local", password: requireEnv("ADMIN_TEST_PASSWORD") }),
  });
  adminToken = String(res.body?.token ?? "");
  if (!adminToken) throw new Error("admin token missing");
}

async function registerUser() {
  const email = `${uniq("dq2_user")}@test.local`;
  const password = requireEnv("E2E_TEST_PASSWORD");

  await api("/api/auth/register", {
    method: "POST",
    auth: "none",
    expect: 201,
    body: JSON.stringify({ email, password, name: "DQ2 User" }),
  });

  const login = await api("/api/auth/login", {
    method: "POST",
    auth: "none",
    expect: 200,
    body: JSON.stringify({ email, password }),
  });
  userToken = String(login.body?.token ?? "");
  userId = String(login.body?.user?.id ?? "");
  if (!userToken || !userId) throw new Error("user token missing");
}

function text(path: string) {
  return readFileSync(path, "utf8");
}

function runTsc() {
  const r = spawnSync("npx", ["tsc", "--noEmit"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  return { ok: r.status === 0, detail: `exit=${r.status} stderr=${(r.stderr || "").slice(0, 180)}` };
}

async function main() {
  const steps: Step[] = [];

  await loginAdmin();
  await registerUser();

  // 1) capabilities unified: has reasoning/search, no image_input in capability toggles
  const aliasPage = text("src/app/(console)/admin/model-aliases/page.tsx");
  const hasReasoning = aliasPage.includes('"reasoning"');
  const hasSearch = aliasPage.includes('"search"');
  const hasImageInputInKeys = /CAPABILITY_KEYS[\s\S]*image_input/.test(aliasPage);
  steps.push({
    id: "F-DQ2-01-capabilities-unified-static",
    ok: hasReasoning && hasSearch && !hasImageInputInKeys,
    detail: `reasoning=${hasReasoning} search=${hasSearch} image_input_in_keys=${hasImageInputInKeys}`,
  });

  // 2) suggest-price endpoint usability + bind flow
  const aliasName = uniq("dq2-alias");
  const createdAlias = await api("/api/admin/model-aliases", {
    method: "POST",
    auth: "admin",
    expect: 201,
    body: JSON.stringify({ alias: aliasName, modality: "TEXT" }),
  });
  const aliasId = String(createdAlias.body?.id ?? "");
  if (!aliasId) throw new Error("alias id missing");

  const suggest1 = await api(`/api/admin/model-aliases/${aliasId}/suggest-price?q=gpt`, {
    method: "GET",
    auth: "admin",
  });

  let suggestOk = false;
  let suggestDetail = `first_status=${suggest1.status}`;
  if (suggest1.status === 200 && Array.isArray(suggest1.body?.candidates) && suggest1.body.candidates.length > 0) {
    const picked = suggest1.body.candidates[0];
    await api(`/api/admin/model-aliases/${aliasId}`, {
      method: "PATCH",
      auth: "admin",
      expect: 200,
      body: JSON.stringify({ openRouterModelId: picked.id }),
    });
    const suggest2 = await api(`/api/admin/model-aliases/${aliasId}/suggest-price`, {
      method: "GET",
      auth: "admin",
    });
    suggestOk = suggest2.status === 200 && suggest2.body?.bound === true;
    suggestDetail = `first=200 candidates=${suggest1.body.candidates.length} second=${suggest2.status} bound=${String(suggest2.body?.bound)}`;
  } else {
    suggestOk = [502, 504].includes(suggest1.status) && Boolean(suggest1.body?.error?.message);
    suggestDetail = `${suggestDetail} fallback_error=${suggest1.body?.error?.code ?? "-"}`;
  }
  steps.push({
    id: "F-DQ2-05-suggest-price-endpoint",
    ok: suggestOk,
    detail: suggestDetail,
  });

  // 3) exchange rate config writable + readable
  const rate = (Math.random() * 2 + 6).toFixed(4);
  await api("/api/admin/config", {
    method: "PUT",
    auth: "admin",
    expect: 200,
    body: JSON.stringify({ key: "USD_TO_CNY_RATE", value: rate, description: "dq2-test" }),
  });
  const rateRes = await api("/api/exchange-rate", {
    method: "GET",
    auth: "user",
    expect: 200,
  });
  steps.push({
    id: "F-DQ2-04-exchange-rate-config",
    ok: Math.abs(Number(rateRes.body?.rate) - Number(rate)) < 1e-9,
    detail: `set=${rate} got=${String(rateRes.body?.rate)}`,
  });

  // 4) recharge CNY conversion path: UI conversion + backend stores USD amount
  const dialog = text("src/components/balance/recharge-dialog.tsx");
  const hasCnyToUsd = /amtUSD\s*=\s*amtCNY\s*\/\s*exchangeRate/.test(dialog);
  const hasYenUi = dialog.includes("¥{a}") && dialog.includes("¥{effectiveAmountCNY.toFixed(2)}");

  const project = await api("/api/projects", {
    method: "POST",
    auth: "user",
    expect: 201,
    body: JSON.stringify({ name: uniq("dq2-project") }),
  });
  const projectId = String(project.body?.id ?? "");
  if (!projectId) throw new Error("project id missing");

  const amountUsd = 10.5;
  const recharge = await api(`/api/projects/${projectId}/recharge`, {
    method: "POST",
    auth: "user",
    expect: 201,
    body: JSON.stringify({ amount: amountUsd, paymentMethod: "alipay" }),
  });
  const orderId = String(recharge.body?.orderId ?? "");
  const order = await prisma.rechargeOrder.findUnique({
    where: { id: orderId },
    select: { amount: true },
  });
  const stored = Number(order?.amount ?? -1);
  steps.push({
    id: "F-DQ2-06-recharge-cny-conversion",
    ok: hasCnyToUsd && hasYenUi && Math.abs(stored - amountUsd) < 1e-9,
    detail: `cny_to_usd=${hasCnyToUsd} yen_ui=${hasYenUi} stored_usd=${stored}`,
  });

  // 5) site-wide CNY display coverage on key pages
  const cnyPages = [
    "src/app/(console)/dashboard/page.tsx",
    "src/app/(console)/usage/page.tsx",
    "src/app/(console)/logs/page.tsx",
    "src/app/(console)/admin/logs/page.tsx",
    "src/app/(console)/models/page.tsx",
    "src/app/(console)/admin/models/page.tsx",
    "src/app/(console)/admin/users/page.tsx",
    "src/app/(console)/balance/page.tsx",
  ];
  const misses: string[] = [];
  for (const p of cnyPages) {
    const content = text(p);
    if (!content.includes("formatCNY")) misses.push(`${p}:missing formatCNY`);
  }
  steps.push({
    id: "F-DQ2-07-cny-display-static",
    ok: misses.length === 0,
    detail: misses.length ? misses.join(" | ") : "target pages use formatCNY",
  });

  // 6) provider adapter prefill completeness
  const providerPage = text("src/app/(console)/admin/providers/page.tsx");
  const requiredAdapters = [
    "openai",
    "anthropic",
    "deepseek",
    "zhipu",
    "volcengine",
    "siliconflow",
    "openrouter",
    "minimax",
    "moonshot",
    "qwen",
    "stepfun",
  ];
  const missingAdapters = requiredAdapters.filter((a) => !new RegExp(`${a}:\\s*\\{`).test(providerPage));
  const baseUrlChecks = [
    "https://api.openai.com/v1",
    "https://api.moonshot.cn/v1",
    "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "https://api.stepfun.com/v1",
  ].every((u) => providerPage.includes(u));
  steps.push({
    id: "F-DQ2-08-provider-prefill",
    ok: missingAdapters.length === 0 && baseUrlChecks,
    detail: `missingAdapters=${missingAdapters.join(",") || "none"} baseUrlsOk=${baseUrlChecks}`,
  });

  // 7) tsc
  const tsc = runTsc();
  steps.push({ id: "F-DQ2-tsc", ok: tsc.ok, detail: tsc.detail });

  const pass = steps.filter((s) => s.ok).length;
  const fail = steps.length - pass;
  const report = {
    batch: "DQ2-alias-quality-pricing",
    executedAt: new Date().toISOString(),
    baseUrl: BASE,
    pass,
    fail,
    steps,
  };

  writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
