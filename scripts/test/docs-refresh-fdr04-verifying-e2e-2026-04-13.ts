import { readFileSync, writeFileSync } from "node:fs";
import OpenAI from "openai";
import { requireEnv } from "../lib/require-env";

const BASE = process.env.BASE_URL ?? "http://localhost:3099";
const OUTPUT =
  process.env.OUTPUT_FILE ?? "docs/test-reports/docs-refresh-fdr04-verifying-e2e-2026-04-13.json";

interface Step {
  id: string;
  ok: boolean;
  detail: string;
}

function nowIso() {
  return new Date().toISOString();
}

function flattenKeys(input: unknown, prefix = ""): string[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) return [];
  const obj = input as Record<string, unknown>;
  const keys: string[] = [];
  for (const k of Object.keys(obj)) {
    const next = prefix ? `${prefix}.${k}` : k;
    const v = obj[k];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      keys.push(...flattenKeys(v, next));
    } else {
      keys.push(next);
    }
  }
  return keys;
}

async function api(path: string, init?: RequestInit & { expected?: number }) {
  const { expected, ...rest } = init ?? {};
  const res = await fetch(`${BASE}${path}`, rest);
  const text = await res.text();
  let body: any = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // keep text
  }
  if (expected && res.status !== expected) {
    throw new Error(`${path}: expected ${expected}, got ${res.status}, body=${text.slice(0, 300)}`);
  }
  return { status: res.status, body, text };
}

function classifyExecution(status: number, body: any) {
  if (status === 200) return { ok: true, reason: "200" };
  const code = String(body?.error?.code ?? "");
  const expectedErrors = new Set(["insufficient_balance", "channel_unavailable", "provider_error"]);
  if ((status === 402 || status === 503 || status === 502) && expectedErrors.has(code)) {
    return { ok: true, reason: `${status}:${code}` };
  }
  return { ok: false, reason: `${status}:${code || "unknown"}` };
}

async function run() {
  const startedAt = nowIso();
  const steps: Step[] = [];

  const smokeModels = await api("/v1/models", { expected: 200 });
  steps.push({
    id: "L1-smoke-models",
    ok: smokeModels.status === 200,
    detail: `status=${smokeModels.status}`,
  });

  const login = await api("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@aigc-gateway.local", password: requireEnv("ADMIN_TEST_PASSWORD") }),
    expected: 200,
  });
  const token = String(login.body?.token ?? "");
  if (!token) throw new Error("admin token missing");

  const createKey = await api("/api/keys", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name: `fdr04-${Date.now()}`, neverExpires: true }),
    expected: 201,
  });
  const apiKey = String(createKey.body?.key ?? "");
  if (!apiKey) throw new Error("api key missing");

  const quickstartCurl = await api("/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-v3",
      messages: [{ role: "user", content: "Say hello in one short sentence." }],
    }),
  });
  const quickstartCurlExec = classifyExecution(quickstartCurl.status, quickstartCurl.body);
  steps.push({
    id: "F-DR-04-quickstart-step1-curl",
    ok: quickstartCurlExec.ok,
    detail: `status=${quickstartCurl.status}, classify=${quickstartCurlExec.reason}`,
  });

  const client = new OpenAI({ apiKey, baseURL: `${BASE}/v1` });

  try {
    await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Say hello in one short sentence." }],
    });
    steps.push({
      id: "F-DR-04-quickstart-step2-openai-sdk",
      ok: true,
      detail: "status=200",
    });
  } catch (err: any) {
    const status = Number(err?.status ?? 0);
    const code = String(err?.error?.code ?? "");
    const ok = status === 402 || status === 503 || status === 502;
    steps.push({
      id: "F-DR-04-quickstart-step2-openai-sdk",
      ok,
      detail: `status=${status}, code=${code || "unknown"}`,
    });
  }

  try {
    const stream = await client.chat.completions.create({
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "Write a haiku about the ocean." }],
      stream: true,
    });
    let chunks = 0;
    for await (const chunk of stream) {
      if (chunk.choices?.[0]?.delta?.content) chunks += 1;
      if (chunks > 0) break;
    }
    steps.push({
      id: "F-DR-04-quickstart-step3-streaming",
      ok: true,
      detail: `status=200, contentChunks>=${chunks}`,
    });
  } catch (err: any) {
    const status = Number(err?.status ?? 0);
    const code = String(err?.error?.code ?? "");
    const ok = status === 402 || status === 503 || status === 502;
    steps.push({
      id: "F-DR-04-quickstart-step3-streaming",
      ok,
      detail: `status=${status}, code=${code || "unknown"}`,
    });
  }

  const docsChat = await api("/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-v3",
      messages: [{ role: "user", content: "Hello" }],
      temperature: 0.7,
      max_tokens: 1024,
      stream: false,
    }),
  });
  const docsChatExec = classifyExecution(docsChat.status, docsChat.body);
  steps.push({
    id: "F-DR-04-docs-chat-curl",
    ok: docsChatExec.ok,
    detail: `status=${docsChat.status}, classify=${docsChatExec.reason}`,
  });

  const docsImage = await api("/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "cogview-3-flash",
      prompt: "A friendly robot",
      size: "1024x1024",
    }),
  });
  const docsImageExec = classifyExecution(docsImage.status, docsImage.body);
  steps.push({
    id: "F-DR-04-docs-images-curl",
    ok: docsImageExec.ok,
    detail: `status=${docsImage.status}, classify=${docsImageExec.reason}`,
  });

  for (const path of ["/v1/models", "/v1/models?modality=text", "/v1/models?modality=image"]) {
    const res = await api(path, { expected: 200 });
    const count = Array.isArray(res.body?.data) ? res.body.data.length : -1;
    steps.push({
      id: `F-DR-04-docs-models-curl-${path.replace(/[^a-z0-9]+/gi, "-")}`,
      ok: res.status === 200,
      detail: `status=${res.status}, count=${count}`,
    });
  }

  const quickstartPage = readFileSync("src/app/(console)/quickstart/page.tsx", "utf8");
  const docsPage = readFileSync("src/app/(console)/docs/page.tsx", "utf8");
  const en = JSON.parse(readFileSync("src/messages/en.json", "utf8"));
  const zh = JSON.parse(readFileSync("src/messages/zh-CN.json", "utf8"));

  const providerPrefixRe = /\b(?:openai|anthropic|deepseek|zhipu|minimax|moonshot|qwen|stepfun|siliconflow|openrouter|volcengine)\/[a-zA-Z0-9._-]+\b/g;
  const docsText = JSON.stringify(en.docs) + JSON.stringify(zh.docs) + JSON.stringify(en.quickstart) + JSON.stringify(zh.quickstart);
  const providerHits = [
    ...(quickstartPage.match(providerPrefixRe) ?? []),
    ...(docsPage.match(providerPrefixRe) ?? []),
    ...(docsText.match(providerPrefixRe) ?? []),
  ];
  steps.push({
    id: "F-DR-04-alias-format-no-provider-prefix",
    ok: providerHits.length === 0,
    detail: `hits=${providerHits.length}${providerHits.length ? `, sample=${providerHits.slice(0, 5).join(",")}` : ""}`,
  });

  const qsLinks = ["/docs#chat", "/docs#images", "/docs#models", "/docs#errors", "/docs#rate-limits", "/mcp-setup"];
  const missingQsLinks = qsLinks.filter((href) => !quickstartPage.includes(`href: "${href}"`));
  const hasDocsBanner = docsPage.includes('href="/quickstart"');
  steps.push({
    id: "F-DR-04-cross-links-clickable",
    ok: missingQsLinks.length === 0 && hasDocsBanner,
    detail: `missingQuickstartLinks=${missingQsLinks.length}, docsBannerLink=${hasDocsBanner}`,
  });

  const quickstartEnKeys = new Set(flattenKeys(en.quickstart));
  const quickstartZhKeys = new Set(flattenKeys(zh.quickstart));
  const docsEnKeys = new Set(flattenKeys(en.docs));
  const docsZhKeys = new Set(flattenKeys(zh.docs));

  const missingQsInZh = [...quickstartEnKeys].filter((k) => !quickstartZhKeys.has(k));
  const missingQsInEn = [...quickstartZhKeys].filter((k) => !quickstartEnKeys.has(k));
  const missingDocsInZh = [...docsEnKeys].filter((k) => !docsZhKeys.has(k));
  const missingDocsInEn = [...docsZhKeys].filter((k) => !docsEnKeys.has(k));

  steps.push({
    id: "F-DR-04-i18n-zh-en-consistency",
    ok:
      missingQsInZh.length === 0 &&
      missingQsInEn.length === 0 &&
      missingDocsInZh.length === 0 &&
      missingDocsInEn.length === 0,
    detail: `quickstart(en->zh)=${missingQsInZh.length}, quickstart(zh->en)=${missingQsInEn.length}, docs(en->zh)=${missingDocsInZh.length}, docs(zh->en)=${missingDocsInEn.length}`,
  });

  const failed = steps.filter((s) => !s.ok);
  const summary = {
    feature: "F-DR-04",
    batch: "DOCS-REFRESH",
    env: "L1-local-3099",
    startedAt,
    finishedAt: nowIso(),
    pass: failed.length === 0,
    passCount: steps.length - failed.length,
    failCount: failed.length,
    steps,
    notes: [
      "L1 本地环境下，chat/images 可能因测试账号余额或 provider key 缺失返回 402/503；本脚本将其视作示例命令可执行（接口可达、参数可解析、返回结构符合预期错误模型）。",
    ],
  };

  writeFileSync(OUTPUT, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  if (!summary.pass) {
    console.error(`F-DR-04 FAIL: ${failed.map((s) => s.id).join(", ")}`);
    process.exit(1);
  }

  console.log(`F-DR-04 PASS: ${summary.passCount}/${steps.length}`);
  console.log(`Report: ${OUTPUT}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
