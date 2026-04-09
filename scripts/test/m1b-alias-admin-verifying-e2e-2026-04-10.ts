import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { existsSync, readFileSync, writeFileSync } from "fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3099";
const MOCK_PORT = Number(process.env.MOCK_PORT ?? "3342");
const MOCK_BASE = `http://127.0.0.1:${MOCK_PORT}`;
const OUTPUT =
  process.env.OUTPUT_FILE ?? "docs/test-reports/m1b-alias-admin-verifying-e2e-2026-04-10.json";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@aigc-gateway.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin123";

const TEST_MODEL_ID = "deepseek/test-classifier-2026";
const TEST_ALIAS = "m1b-test-alias";

type Step = { id: string; name: string; ok: boolean; detail: string };

let adminToken = "";

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function startMockServer() {
  const server = createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/models") {
      json(res, 200, {
        object: "list",
        data: [{ id: TEST_MODEL_ID }],
      });
      return;
    }

    if (req.method === "POST" && req.url === "/chat/completions") {
      const bodyText = await readBody(req);
      const body = JSON.parse(bodyText || "{}");
      const prompt = String(body?.messages?.[0]?.content ?? "");

      let content = "{}";
      if (prompt.includes("待分类的新模型 ID")) {
        content = JSON.stringify({
          [TEST_MODEL_ID]: { new_alias: TEST_ALIAS, brand: "DeepSeek" },
        });
      } else if (prompt.includes("别名列表")) {
        content = JSON.stringify({ [TEST_ALIAS]: "DeepSeek" });
      }

      json(res, 200, {
        id: "chatcmpl-m1b-classifier",
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: "deepseek-chat",
        choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
        usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
      });
      return;
    }

    await readBody(req);
    json(res, 404, { error: "not_found" });
  });

  await new Promise<void>((resolve) => server.listen(MOCK_PORT, "127.0.0.1", resolve));
  return server;
}

async function api(path: string, init?: RequestInit & { expect?: number; auth?: "jwt" | "none" }) {
  const { expect, auth = "jwt", ...rest } = init ?? {};
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(rest.headers as Record<string, string> | undefined),
  };
  if (auth === "jwt" && adminToken) headers.authorization = `Bearer ${adminToken}`;

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
  return { status: res.status, body, text };
}

async function loginAdmin() {
  const res = await api("/api/auth/login", {
    method: "POST",
    auth: "none",
    expect: 200,
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  adminToken = String(res.body?.token ?? "");
  if (!adminToken) throw new Error("admin token missing");
}

async function patchProvidersForDeterministicSync() {
  const providers = await api("/api/admin/providers", { expect: 200 });
  const list = providers.body?.data ?? [];

  for (const p of list) {
    const isDeepSeek = p.name === "deepseek";
    await api(`/api/admin/providers/${p.id}`, {
      method: "PATCH",
      expect: 200,
      body: JSON.stringify(
        isDeepSeek
          ? {
              status: "ACTIVE",
              baseUrl: MOCK_BASE,
              apiKey: "mock-deepseek-key",
            }
          : { status: "DISABLED" },
      ),
    });
  }
}

async function triggerAndWaitSync(): Promise<boolean> {
  const before = await api("/api/admin/debug/sync", { expect: 200 });
  const beforeSyncAt = String(before.body?.lastSyncAt ?? "");

  await api("/api/admin/sync-models", { method: "POST", expect: 202 });

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const now = await api("/api/admin/debug/sync", { expect: 200 });
    const nowSyncAt = String(now.body?.lastSyncAt ?? "");
    if (nowSyncAt && nowSyncAt !== beforeSyncAt) return true;
  }

  return false;
}

function staticAudit(): { findings: string[]; designMatch: boolean; i18nClean: boolean; dsTokenClean: boolean } {
  const pagePath = "src/app/(console)/admin/model-aliases/page.tsx";
  const designPath = "design-draft/admin-model-aliases/code.html";
  const sidebarPath = "src/components/sidebar.tsx";

  const page = readFileSync(pagePath, "utf8");
  const design = readFileSync(designPath, "utf8");
  const sidebar = readFileSync(sidebarPath, "utf8");

  const findings: string[] = [];

  const designHasSupportedSizes = design.includes("Supported Sizes");
  const implHasSupportedSizes = page.includes("supportedSizes") || page.includes("Supported Sizes");
  const designMatch = !(designHasSupportedSizes && !implHasSupportedSizes);
  if (!designMatch) findings.push("Design mismatch: 'Supported Sizes' section exists in design but missing in implementation.");

  const hardcodedI18nPatterns = [
    "Function Calling",
    "Streaming",
    "Vision",
    "System Prompt",
    "JSON Mode",
    "Image Input",
    "e.g. gpt-4o",
    "e.g. OpenAI",
  ];
  const i18nHits = hardcodedI18nPatterns.filter((s) => page.includes(s));
  const i18nClean = i18nHits.length === 0;
  if (!i18nClean) findings.push(`i18n residue: ${i18nHits.join(", ")}`);

  const colorRegexes = [/text-green-700/, /bg-green-100/, /hover:bg-slate-50/, /text-slate-400/, /bg-slate-200/];
  const dsHits = colorRegexes.filter((re) => re.test(page)).map((re) => re.source);
  const dsTokenClean = dsHits.length === 0;
  if (!dsTokenClean) findings.push(`DS token inconsistency: ${dsHits.join(", ")}`);

  if (sidebar.includes("/admin/model-whitelist") || sidebar.includes("/admin/model-capabilities")) {
    findings.push("Sidebar still contains removed pages.");
  }

  return { findings, designMatch, i18nClean, dsTokenClean };
}

async function run() {
  const steps: Step[] = [];
  const mock = await startMockServer();

  try {
    await loginAdmin();
    await patchProvidersForDeterministicSync();

    const syncAdvanced = await triggerAndWaitSync();
    steps.push({
      id: "AC1-A",
      name: "Sync job triggered and lastSyncAt advanced",
      ok: syncAdvanced,
      detail: `sync_advanced=${syncAdvanced}`,
    });

    const aliasesRes = await api("/api/admin/model-aliases", { expect: 200 });
    const aliases = aliasesRes.body?.data ?? [];
    const hit = aliases.find((a: any) =>
      Array.isArray(a.linkedModels) &&
      a.linkedModels.some((lm: any) => lm.modelName === TEST_MODEL_ID),
    );
    steps.push({
      id: "AC1-B",
      name: "LLM classification created alias and linked model",
      ok: !!hit && (hit.linkedModelCount ?? 0) > 0,
      detail: `alias_found=${!!hit}, alias=${hit?.alias ?? "null"}, linkedModelCount=${hit?.linkedModelCount ?? 0}`,
    });

    steps.push({
      id: "AC1-C",
      name: "Brand inference persisted",
      ok: !!hit && !!hit.brand,
      detail: `brand=${hit?.brand ?? "null"}`,
    });

    const adminPageExists = existsSync("src/app/(console)/admin/model-aliases/page.tsx");
    steps.push({
      id: "AC2",
      name: "Admin alias management page exists",
      ok: adminPageExists,
      detail: `exists=${adminPageExists}`,
    });

    const whitelistPageExists = existsSync("src/app/(console)/admin/model-whitelist/page.tsx");
    const capabilitiesPageExists = existsSync("src/app/(console)/admin/model-capabilities/page.tsx");
    const sidebar = readFileSync("src/components/sidebar.tsx", "utf8");
    const navClean =
      !sidebar.includes("/admin/model-whitelist") && !sidebar.includes("/admin/model-capabilities");
    steps.push({
      id: "AC3",
      name: "Whitelist/Capabilities pages removed and nav cleaned",
      ok: !whitelistPageExists && !capabilitiesPageExists && navClean,
      detail: `whitelist_exists=${whitelistPageExists}, capabilities_exists=${capabilitiesPageExists}, nav_clean=${navClean}`,
    });

    const audit = staticAudit();
    steps.push({
      id: "AC4",
      name: "DS token consistency and zero hardcoded colors",
      ok: audit.dsTokenClean,
      detail: audit.dsTokenClean ? "clean" : audit.findings.join(" | "),
    });

    steps.push({
      id: "AC5",
      name: "i18n no residue",
      ok: audit.i18nClean,
      detail: audit.i18nClean ? "clean" : audit.findings.join(" | "),
    });

    steps.push({
      id: "AC2-design",
      name: "Design draft parity (key section checks)",
      ok: audit.designMatch,
      detail: audit.designMatch ? "matched" : audit.findings.join(" | "),
    });
  } finally {
    await new Promise<void>((resolve, reject) => mock.close((err) => (err ? reject(err) : resolve())));
  }

  const passCount = steps.filter((s) => s.ok).length;
  const failCount = steps.length - passCount;

  const result = {
    batch: "M1b-alias-automation-admin-ui",
    feature: "F-M1b-06",
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
