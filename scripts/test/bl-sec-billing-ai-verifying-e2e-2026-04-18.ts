import "../../tests/helpers/load-test-env";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { PrismaClient } from "@prisma/client";
import { startMockProvider } from "../../tests/mocks/provider-server";
import { requireEnv } from "../lib/require-env";

const BASE = process.env.BASE_URL ?? "http://localhost:3199";
const OUTPUT_FILE =
  process.env.OUTPUT_FILE ??
  "docs/test-reports/artifacts/bl-sec-billing-ai-verifying-2026-04-18/local-evidence.json";
const MOCK_PORT = Number(process.env.MOCK_PORT ?? "3338");

const prisma = new PrismaClient();

type Step = { id: string; ok: boolean; detail: string };
const steps: Step[] = [];

let userId = "";
let projectId = "";
let apiKey = "";
let userToken = "";
let adminToken = "";
let seededTemplateId = "";

const email = `bl_ba_${Date.now()}@test.local`;
const password = requireEnv("E2E_TEST_PASSWORD");

let restoreProviderState: {
  id: string;
  baseUrl: string;
  authConfig: unknown;
  proxyUrl: string | null;
} | null = null;

function pushStep(id: string, ok: boolean, detail: string) {
  steps.push({ id, ok, detail });
  const mark = ok ? "PASS" : "FAIL";
  console.log(`[${mark}] ${id} - ${detail}`);
}

async function run(id: string, fn: () => Promise<string>) {
  try {
    const detail = await fn();
    pushStep(id, true, detail);
  } catch (error) {
    pushStep(id, false, (error as Error).message);
  }
}

async function api(
  path: string,
  init?: RequestInit & { expect?: number; auth?: "none" | "user" | "admin" | "key" },
) {
  const { expect, auth = "none", ...rest } = init ?? {};
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(rest.headers as Record<string, string> | undefined),
  };
  if (auth === "user" && userToken) headers.authorization = `Bearer ${userToken}`;
  if (auth === "admin" && adminToken) headers.authorization = `Bearer ${adminToken}`;
  if (auth === "key" && apiKey) headers.authorization = `Bearer ${apiKey}`;

  const res = await fetch(`${BASE}${path}`, { ...rest, headers });
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

function ensure23514(err: unknown, tag: string) {
  const msg = JSON.stringify(err);
  if (!msg.includes("23514")) {
    throw new Error(`${tag} expected SQLSTATE 23514, got: ${msg}`);
  }
}

async function setupAuth() {
  await api("/api/auth/register", {
    method: "POST",
    expect: 201,
    auth: "none",
    body: JSON.stringify({ email, password, name: "BL-SEC-BILLING-AI Tester" }),
  });

  const login = await api("/api/auth/login", {
    method: "POST",
    expect: 200,
    auth: "none",
    body: JSON.stringify({ email, password }),
  });
  userToken = String(login.body?.token ?? "");
  userId = String(login.body?.user?.id ?? "");
  if (!userToken || !userId) throw new Error("user login/token missing");

  const adminLogin = await api("/api/auth/login", {
    method: "POST",
    expect: 200,
    auth: "none",
    body: JSON.stringify({ email: "admin@aigc-gateway.local", password: requireEnv("ADMIN_TEST_PASSWORD") }),
  });
  adminToken = String(adminLogin.body?.token ?? "");
  if (!adminToken) throw new Error("admin token missing");

  const p = await api("/api/projects", {
    method: "POST",
    expect: 201,
    auth: "user",
    body: JSON.stringify({ name: `BL-SEC-BILLING-AI ${Date.now()}` }),
  });
  projectId = String(p.body?.id ?? "");
  if (!projectId) throw new Error("project id missing");

  const key = await api("/api/keys", {
    method: "POST",
    expect: 201,
    auth: "user",
    body: JSON.stringify({ name: "bl-sec-billing-ai-key", rateLimit: 120 }),
  });
  apiKey = String(key.body?.key ?? "");
  if (!apiKey) throw new Error("api key missing");

  await prisma.user.update({
    where: { id: userId },
    data: { balance: 1, defaultProjectId: projectId },
  });
}

async function setupMockRoute() {
  const mock = await startMockProvider({
    port: MOCK_PORT,
    onRequest: (req, res, body) => {
      if (req.method === "POST" && req.url === "/v1/chat/completions") {
        const parsed = JSON.parse(body || "{}");
        const model = String(parsed.model ?? "mock");
        const created = Math.floor(Date.now() / 1000);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            id: `chatcmpl-${Date.now()}`,
            object: "chat.completion",
            created,
            model,
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: "mock-ok" },
                finish_reason: "stop",
              },
            ],
            // Pricing fixture: with alias sellPrice 15 / 1M on input+output,
            // this usage should cost roughly $0.15 per successful request.
            usage: { prompt_tokens: 5000, completion_tokens: 5000, total_tokens: 10000 },
          }),
        );
        return true;
      }
      return false;
    },
  });

  const provider = await prisma.provider.findUniqueOrThrow({
    where: { name: "openai" },
    select: { id: true, baseUrl: true, authConfig: true, proxyUrl: true },
  });
  restoreProviderState = {
    id: provider.id,
    baseUrl: provider.baseUrl,
    authConfig: provider.authConfig,
    proxyUrl: provider.proxyUrl,
  };

  await prisma.provider.update({
    where: { id: provider.id },
    data: { baseUrl: `${mock.baseUrl}/v1`, authConfig: { apiKey: "mock-openai-key" }, proxyUrl: null },
  });

  const model = await prisma.model.upsert({
    where: { name: "openai/gpt-4o-mini" },
    update: {
      enabled: true,
      modality: "TEXT",
      displayName: "OpenAI GPT-4o-mini",
      contextWindow: 128000,
      maxTokens: 16384,
      capabilities: { streaming: true, json_mode: true, unknown: false },
    },
    create: {
      name: "openai/gpt-4o-mini",
      enabled: true,
      modality: "TEXT",
      displayName: "OpenAI GPT-4o-mini",
      contextWindow: 128000,
      maxTokens: 16384,
      capabilities: { streaming: true, json_mode: true, unknown: false },
    },
  });

  await prisma.channel.upsert({
    where: { providerId_modelId: { providerId: provider.id, modelId: model.id } },
    update: {
      realModelId: "gpt-4o-mini",
      status: "ACTIVE",
      priority: 1,
      costPrice: { unit: "token", inputPer1M: 0.1, outputPer1M: 0.2, currency: "USD" },
      sellPrice: { unit: "token", inputPer1M: 15, outputPer1M: 15, currency: "USD" },
    },
    create: {
      providerId: provider.id,
      modelId: model.id,
      realModelId: "gpt-4o-mini",
      status: "ACTIVE",
      priority: 1,
      costPrice: { unit: "token", inputPer1M: 0.1, outputPer1M: 0.2, currency: "USD" },
      sellPrice: { unit: "token", inputPer1M: 15, outputPer1M: 15, currency: "USD" },
    },
  });

  const alias = await prisma.modelAlias.upsert({
    where: { alias: "deepseek/v3" },
    update: {
      enabled: true,
      modality: "TEXT",
      sellPrice: { unit: "token", inputPer1M: 15, outputPer1M: 15, currency: "USD" },
    },
    create: {
      alias: "deepseek/v3",
      enabled: true,
      modality: "TEXT",
      sellPrice: { unit: "token", inputPer1M: 15, outputPer1M: 15, currency: "USD" },
    },
    select: { id: true },
  });

  await prisma.aliasModelLink.upsert({
    where: { aliasId_modelId: { aliasId: alias.id, modelId: model.id } },
    update: {},
    create: { aliasId: alias.id, modelId: model.id },
  });

  return mock;
}

async function main() {
  console.log("BL-SEC-BILLING-AI local verifying start");
  await setupAuth();
  const mock = await setupMockRoute();

  let httpStatuses: number[] = [];
  let successCount = 0;
  let deductionCount = 0;
  let duplicateCount = 0;
  let finalBalance = 0;

  await run("TC-BA-01-overdraft-protection", async () => {
    await prisma.user.update({ where: { id: userId }, data: { balance: 1 } });
    const since = new Date(Date.now() - 250);

    const fire = () =>
      fetch(`${BASE}/v1/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "deepseek/v3",
          messages: [{ role: "user", content: "billing-check" }],
          max_tokens: 16,
        }),
      }).then(async (res) => {
        await res.text();
        return res.status;
      });

    httpStatuses = await Promise.all(Array.from({ length: 10 }, fire));
    await new Promise((r) => setTimeout(r, 8000));

    const [user, logs, txns] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { balance: true } }),
      prisma.callLog.findMany({
        where: { projectId, status: "SUCCESS", createdAt: { gte: since } },
        select: { id: true },
      }),
      prisma.transaction.findMany({
        where: {
          userId,
          type: "DEDUCTION",
          callLogId: { not: null },
          createdAt: { gte: since },
        },
        select: { callLogId: true },
      }),
    ]);

    finalBalance = Number(user.balance);
    successCount = logs.length;
    deductionCount = txns.length;

    const m = new Map<string, number>();
    for (const t of txns) {
      if (!t.callLogId) continue;
      m.set(t.callLogId, (m.get(t.callLogId) ?? 0) + 1);
    }
    duplicateCount = [...m.values()].filter((n) => n > 1).length;

    if (finalBalance < 0) throw new Error(`balance negative: ${finalBalance}`);
    if (logs.length >= 10) {
      throw new Error(`expected partial deduction under $1 budget, success_logs=${logs.length}`);
    }
    return `balance=${finalBalance}, statuses=${httpStatuses.join(",")}`;
  });

  await run("TC-BA-02-calllog-transaction-consistency", async () => {
    if (successCount !== deductionCount) {
      throw new Error(`SUCCESS logs=${successCount}, DEDUCTION txns=${deductionCount}`);
    }
    return `success=${successCount}, deductions=${deductionCount}`;
  });

  await run("TC-BA-03-callLogId-uniqueness", async () => {
    if (duplicateCount !== 0) throw new Error(`duplicate callLogId groups=${duplicateCount}`);
    return "duplicate callLogId groups=0";
  });

  await run("TC-BA-04-transaction-rollback-on-throw", async () => {
    const marker = `tc_ba_throw_${Date.now()}`;
    const before = await prisma.callLog.count({
      where: { projectId, errorCode: marker },
    });
    try {
      await prisma.$transaction(async (tx) => {
        const c = await tx.callLog.create({
          data: {
            projectId,
            modelName: "deepseek/v3",
            promptSnapshot: { marker },
            status: "ERROR",
            errorCode: marker,
            errorMessage: "intentional throw for rollback test",
          },
          select: { id: true },
        });
        await tx.transaction.create({
          data: {
            userId,
            projectId,
            type: "ADJUSTMENT",
            amount: 0,
            balanceAfter: finalBalance,
            callLogId: c.id,
            description: marker,
          },
        });
        throw new Error(marker);
      });
    } catch (err) {
      if (!(err as Error).message.includes(marker)) {
        throw err;
      }
    }
    const [afterCallLogs, afterTxns] = await Promise.all([
      prisma.callLog.count({ where: { projectId, errorCode: marker } }),
      prisma.transaction.count({ where: { description: marker } }),
    ]);
    if (afterCallLogs !== before) {
      throw new Error(`rollback failed for call_logs: before=${before}, after=${afterCallLogs}`);
    }
    if (afterTxns !== 0) {
      throw new Error(`rollback failed for transactions: found=${afterTxns}`);
    }
    return `rollback confirmed (call_logs=${afterCallLogs}, txns=${afterTxns})`;
  });

  await run("TC-BA-05-check-transactions-amount", async () => {
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "transactions" ("id","userId","projectId","type","amount","balanceAfter","description","createdAt")
         VALUES ($1,$2,$3,'DEDUCTION',10,0,$4,NOW())`,
        `tc_ba_invalid_txn_${Date.now()}`,
        userId,
        projectId,
        "tc_ba_invalid_positive_deduction",
      );
    } catch (err) {
      ensure23514(err, "transactions_amount_sign_check");
      return "rejected with 23514";
    }
    throw new Error("invalid DEDUCTION(amount>0) unexpectedly inserted");
  });

  await run("TC-BA-06-check-template-ratings-score", async () => {
    const seeded = await prisma.template.create({
      data: { projectId, name: `tc-ba-template-${Date.now()}`, isPublic: true },
      select: { id: true },
    });
    seededTemplateId = seeded.id;
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "template_ratings" ("id","userId","templateId","score","createdAt","updatedAt")
         VALUES ($1,$2,$3,10,NOW(),NOW())`,
        `tc_ba_invalid_rating_${Date.now()}`,
        userId,
        seededTemplateId,
      );
    } catch (err) {
      ensure23514(err, "template_ratings_score_range_check");
      return "rejected with 23514";
    }
    throw new Error("invalid score=10 unexpectedly inserted");
  });

  await mock.close();

  if (restoreProviderState) {
    await prisma.provider.update({
      where: { id: restoreProviderState.id },
      data: {
        baseUrl: restoreProviderState.baseUrl,
        authConfig: restoreProviderState.authConfig as any,
        proxyUrl: restoreProviderState.proxyUrl,
      },
    });
  }

  if (seededTemplateId) {
    await prisma.template.delete({ where: { id: seededTemplateId } }).catch(() => {});
  }

  const payload = {
    batch: "BL-SEC-BILLING-AI",
    date: "2026-04-18",
    baseUrl: BASE,
    userId,
    projectId,
    summary: {
      passed: steps.filter((s) => s.ok).length,
      failed: steps.filter((s) => !s.ok).length,
      httpStatuses,
      finalBalance,
      successCount,
      deductionCount,
      duplicateCount,
    },
    steps,
  };

  mkdirSync(dirname(OUTPUT_FILE), { recursive: true });
  writeFileSync(OUTPUT_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Evidence written: ${OUTPUT_FILE}`);

  await prisma.$disconnect();
  if (steps.some((s) => !s.ok)) {
    process.exit(1);
  }
}

main().catch(async (error) => {
  console.error("Fatal:", error);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
