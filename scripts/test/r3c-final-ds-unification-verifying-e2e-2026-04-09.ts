import { readFileSync, writeFileSync } from "fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3099";
const OUTPUT =
  process.env.OUTPUT_FILE ??
  "docs/test-reports/r3c-final-ds-unification-verifying-e2e-2026-04-09.json";

type Step = { name: string; ok: boolean; detail: string };

const RUN_ID = Date.now();

let adminToken = "";

const targetFiles = {
  whitelist: "src/app/(console)/admin/model-whitelist/page.tsx",
  aliases: "src/app/(console)/admin/model-aliases/page.tsx",
  capabilities: "src/app/(console)/admin/model-capabilities/page.tsx",
  docs: "src/app/(console)/docs/page.tsx",
  layout: "src/app/layout.tsx",
  login: "src/app/(auth)/login/page.tsx",
  register: "src/app/(auth)/register/page.tsx",
  mcp: "src/app/(console)/mcp-setup/page.tsx",
};

function read(path: string) {
  return readFileSync(path, "utf8");
}

async function api(
  path: string,
  init?: RequestInit & { expect?: number; auth?: "admin" | "none" },
) {
  const { expect, auth = "none", ...rest } = init ?? {};
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(rest.headers as Record<string, string> | undefined),
  };
  if (auth === "admin" && adminToken) headers.Authorization = `Bearer ${adminToken}`;
  const res = await fetch(`${BASE}${path}`, { ...rest, headers, redirect: "manual" });
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
  return { status: res.status, body, text, headers: res.headers };
}

function countMatches(text: string, re: RegExp) {
  const m = text.match(re);
  return m ? m.length : 0;
}

async function setupAdminAuth() {
  const login = await api("/api/auth/login", {
    method: "POST",
    auth: "none",
    expect: 200,
    body: JSON.stringify({ email: "admin@aigc-gateway.local", password: "admin123" }),
  });
  adminToken = String(login.body?.token ?? "");
  if (!adminToken) throw new Error("admin token missing");
}

async function run() {
  const steps: Step[] = [];
  try {
    await setupAdminAuth();

    // AC1 smoke + page loads
    const smoke = await api("/api/v1/models", { expect: 200 });
    steps.push({
      name: "AC1 smoke endpoint /api/v1/models ready",
      ok: Array.isArray(smoke.body?.data),
      detail: `status=${smoke.status}, models=${smoke.body?.data?.length ?? 0}`,
    });

    const publicPages = ["/login", "/register"];
    const authedPages = [
      "/admin/model-whitelist",
      "/admin/model-aliases",
      "/admin/model-capabilities",
      "/docs",
      "/mcp-setup",
    ];
    const pageDetails: string[] = [];
    let pageOk = true;

    for (const p of publicPages) {
      const r = await api(p, { expect: 200 });
      const ok = r.text.includes("<!DOCTYPE html>");
      pageOk = pageOk && ok;
      pageDetails.push(`${p}:${r.status}/${ok ? "html" : "non-html"}`);
    }
    for (const p of authedPages) {
      const r = await api(p, { auth: "admin", expect: 200 });
      const ok = r.text.includes("<!DOCTYPE html>");
      pageOk = pageOk && ok;
      pageDetails.push(`${p}:${r.status}/${ok ? "html" : "non-html"}`);
    }
    steps.push({
      name: "AC1 all R3C target pages load",
      ok: pageOk,
      detail: pageDetails.join(", "),
    });

    // AC2 DS token audit
    const allText = Object.values(targetFiles).map(read).join("\n");
    const legacyTokens = [
      { key: "bg-card", re: /\bbg-card\b/g },
      { key: "bg-muted", re: /\bbg-muted\b/g },
      { key: "text-muted-foreground", re: /\btext-muted-foreground\b/g },
      { key: "bg-background", re: /\bbg-background\b/g },
    ];
    const legacyFound = legacyTokens
      .map((x) => `${x.key}:${countMatches(allText, x.re)}`)
      .filter((s) => !s.endsWith(":0"));
    const indigoCount = countMatches(allText, /\bbg-indigo-[0-9]{2,3}\b/g);
    const dsOk = legacyFound.length === 0 && indigoCount === 0;
    steps.push({
      name: "AC2 DS token audit passes (no legacy tokens / no bg-indigo-*)",
      ok: dsOk,
      detail: `legacy=${legacyFound.join("|") || "none"}, bg-indigo=${indigoCount}`,
    });

    // AC3 i18n audit
    const loginSrc = read(targetFiles.login);
    const registerSrc = read(targetFiles.register);
    const mcpSrc = read(targetFiles.mcp);
    const docsSrc = read(targetFiles.docs);
    const messagesEn = read("src/messages/en.json");
    const messagesZh = read("src/messages/zh-CN.json");

    const translationsWired =
      loginSrc.includes('useTranslations("auth")') &&
      registerSrc.includes('useTranslations("auth")') &&
      mcpSrc.includes('useTranslations("mcpSetup")') &&
      docsSrc.includes('useTranslations("docs")');

    const requiredKeysOk =
      messagesEn.includes('"auth"') &&
      messagesZh.includes('"auth"') &&
      messagesEn.includes('"mcpSetup"') &&
      messagesZh.includes('"mcpSetup"');

    const knownHardcoded = [
      loginSrc.includes("[SYSTEM] Initializing secure handshake...")
        ? "login.terminal-system-line"
        : "",
      loginSrc.includes("aigc-cli — bash") ? "login.terminal-title" : "",
      registerSrc.includes("Professional Observability for modern AI developers")
        ? "register.terminal-tagline"
        : "",
      registerSrc.includes("TRACE: Connection established at edge node LON-1")
        ? "register.terminal-trace"
        : "",
    ].filter(Boolean);

    steps.push({
      name: "AC3 i18n audit passes (translations wired and no known hardcoded English remnants)",
      ok: translationsWired && requiredKeysOk && knownHardcoded.length === 0,
      detail: `wired=${translationsWired}, keys=${requiredKeysOk}, hardcoded=${knownHardcoded.join("|") || "none"}`,
    });

    // AC4 design spot checks (login/register/mcp)
    const designOk =
      loginSrc.includes("<Terminal") &&
      loginSrc.includes("lg:w-1/2") &&
      registerSrc.includes("lg:w-1/2") &&
      mcpSrc.includes("CLIENT_OPTIONS") &&
      mcpSrc.includes("generateConfig(");
    steps.push({
      name: "AC4 design spot checks pass for login/register/mcp-setup",
      ok: designOk,
      detail: `loginTerminal=${loginSrc.includes("<Terminal")}, splitLayout=${
        loginSrc.includes("lg:w-1/2") && registerSrc.includes("lg:w-1/2")
      }, mcpClientConfig=${mcpSrc.includes("CLIENT_OPTIONS") && mcpSrc.includes("generateConfig(")}`,
    });

    const passCount = steps.filter((s) => s.ok).length;
    const failCount = steps.length - passCount;
    writeFileSync(
      OUTPUT,
      JSON.stringify(
        {
          baseUrl: BASE,
          runId: RUN_ID,
          passCount,
          failCount,
          steps,
        },
        null,
        2,
      ),
      "utf8",
    );
    if (failCount > 0) {
      console.error(`[r3c-final-ds-unification-verifying] failed: ${failCount} step(s) failed`);
      process.exit(1);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.stack ?? err.message : String(err);
    writeFileSync(
      OUTPUT,
      JSON.stringify(
        {
          baseUrl: BASE,
          runId: RUN_ID,
          passCount: 0,
          failCount: 1,
          steps: [{ name: "script runtime", ok: false, detail: msg }],
        },
        null,
        2,
      ),
      "utf8",
    );
    console.error(`[r3c-final-ds-unification-verifying] script error: ${msg}`);
    process.exit(1);
  }
}

void run();
