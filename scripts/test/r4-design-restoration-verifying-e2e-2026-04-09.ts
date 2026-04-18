import { readFileSync, writeFileSync } from "fs";
import { requireEnv } from "../lib/require-env";

const BASE = process.env.BASE_URL ?? "http://localhost:3099";
const OUTPUT =
  process.env.OUTPUT_FILE ?? "docs/test-reports/r4-design-restoration-verifying-e2e-2026-04-09.json";

type Step = { name: string; ok: boolean; detail: string };

let adminToken = "";

const files = {
  whitelist: "src/app/(console)/admin/model-whitelist/page.tsx",
  aliases: "src/app/(console)/admin/model-aliases/page.tsx",
  capabilities: "src/app/(console)/admin/model-capabilities/page.tsx",
  userDetail: "src/app/(console)/admin/users/[id]/page.tsx",
  templates: "src/app/(console)/admin/templates/page.tsx",
  mcp: "src/app/(console)/mcp-setup/page.tsx",
  login: "src/app/(auth)/login/page.tsx",
  register: "src/app/(auth)/register/page.tsx",
  authTerminal: "src/components/auth-terminal.tsx",
  msgEn: "src/messages/en.json",
  msgZh: "src/messages/zh-CN.json",
};

function read(path: string) {
  return readFileSync(path, "utf8");
}

async function api(path: string, init?: RequestInit & { expect?: number; auth?: "admin" | "none" }) {
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
  return { status: res.status, body, text };
}

async function setupAdmin() {
  const login = await api("/api/auth/login", {
    method: "POST",
    auth: "none",
    expect: 200,
    body: JSON.stringify({ email: "admin@aigc-gateway.local", password: requireEnv("ADMIN_TEST_PASSWORD") }),
  });
  adminToken = String(login.body?.token ?? "");
  if (!adminToken) throw new Error("admin token missing");
}

function countMatches(text: string, re: RegExp) {
  const m = text.match(re);
  return m ? m.length : 0;
}

async function run() {
  const steps: Step[] = [];
  try {
    await setupAdmin();

    // AC1: smoke + page load
    const smoke = await api("/api/v1/models", { expect: 200 });
    steps.push({
      name: "AC1 smoke endpoint ready",
      ok: Array.isArray(smoke.body?.data),
      detail: `status=${smoke.status}, models=${smoke.body?.data?.length ?? 0}`,
    });

    const pages: Array<{ path: string; auth?: "admin" | "none" }> = [
      { path: "/login" },
      { path: "/register" },
      { path: "/admin/model-whitelist", auth: "admin" },
      { path: "/admin/model-aliases", auth: "admin" },
      { path: "/admin/model-capabilities", auth: "admin" },
      { path: "/admin/templates", auth: "admin" },
      { path: "/mcp-setup", auth: "admin" },
    ];
    let pagesOk = true;
    const pageDetails: string[] = [];
    for (const p of pages) {
      const r = await api(p.path, { auth: p.auth ?? "none", expect: 200 });
      const html = r.text.includes("<!DOCTYPE html>");
      pagesOk = pagesOk && html;
      pageDetails.push(`${p.path}:${r.status}/${html ? "html" : "non-html"}`);
    }
    steps.push({
      name: "AC1 all R4 target pages load",
      ok: pagesOk,
      detail: pageDetails.join(", "),
    });

    const whitelist = read(files.whitelist);
    const aliases = read(files.aliases);
    const capabilities = read(files.capabilities);
    const userDetail = read(files.userDetail);
    const templates = read(files.templates);
    const mcp = read(files.mcp);
    const login = read(files.login);
    const register = read(files.register);
    const authTerminal = read(files.authTerminal);
    const msgEn = read(files.msgEn);
    const msgZh = read(files.msgZh);

    // AC2: structure checks
    const structureOk =
      whitelist.includes('t("colProvider")') &&
      whitelist.includes('t("colPrice")') &&
      whitelist.includes("filter_list") &&
      whitelist.includes("...") &&
      aliases.includes("grid-cols-1 md:grid-cols-2 lg:grid-cols-3") &&
      aliases.includes("question_mark") &&
      aliases.includes('t("canonicalIdentifiers"') &&
      capabilities.includes("grid grid-cols-12") &&
      capabilities.includes('t("bulkUpdate")') &&
      capabilities.includes('t("lastSync"') &&
      capabilities.includes('t("capUtilization")') &&
      userDetail.includes('t("balanceHistory")') &&
      userDetail.includes('t("dangerZone")') &&
      templates.includes("grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3") &&
      templates.includes("qualityScore") &&
      mcp.includes("grid grid-cols-12") &&
      mcp.includes('t("latencyOptimization")') &&
      mcp.includes('t("e2eEncryption")') &&
      mcp.includes('t("globalGateway")') &&
      login.includes("AuthLeftPanel") &&
      register.includes("AuthLeftPanel");
    steps.push({
      name: "AC2 design structure spot checks pass",
      ok: structureOk,
      detail: `whitelist9col=${whitelist.includes('t("colProvider")') && whitelist.includes('t("colPrice")')}, aliases3col=${aliases.includes("grid-cols-1 md:grid-cols-2 lg:grid-cols-3")}, capabilities12=${capabilities.includes("grid grid-cols-12")}, userDetailZones=${userDetail.includes('t("balanceHistory")') && userDetail.includes('t("dangerZone")')}, templates3col=${templates.includes("grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3")}, mcpBento=${mcp.includes("grid grid-cols-12")}, authShared=${login.includes("AuthLeftPanel") && register.includes("AuthLeftPanel")}`,
    });

    // AC3: DS token + hardcoded color audit
    const targetAll = [whitelist, aliases, capabilities, userDetail, templates, mcp, login, register, authTerminal].join("\n");
    const legacy =
      countMatches(targetAll, /\bbg-card\b/g) +
      countMatches(targetAll, /\bbg-muted\b/g) +
      countMatches(targetAll, /\btext-muted-foreground\b/g) +
      countMatches(targetAll, /\bbg-background\b/g);

    const hardcodedColor =
      countMatches(targetAll, /\b(bg|text|border)-(slate|gray|zinc|neutral|indigo|orange|green|red|amber)-[0-9]{2,3}\b/g) +
      countMatches(targetAll, /\b(bg|text)-\[#/g) +
      countMatches(targetAll, /#[0-9A-Fa-f]{3,8}/g);

    steps.push({
      name: "AC3 DS token audit (zero legacy token and zero hardcoded color)",
      ok: legacy === 0 && hardcodedColor === 0,
      detail: `legacy=${legacy}, hardcodedColor=${hardcodedColor}`,
    });

    // AC4: i18n audit
    const i18nWired =
      whitelist.includes("useTranslations(") &&
      aliases.includes("useTranslations(") &&
      capabilities.includes("useTranslations(") &&
      userDetail.includes("useTranslations(") &&
      templates.includes("useTranslations(") &&
      mcp.includes("useTranslations(") &&
      login.includes('useTranslations("auth")') &&
      register.includes('useTranslations("auth")');

    const i18nKeys =
      msgEn.includes('"modelWhitelist"') &&
      msgZh.includes('"modelWhitelist"') &&
      msgEn.includes('"modelAliases"') &&
      msgZh.includes('"modelAliases"') &&
      msgEn.includes('"modelCapabilities"') &&
      msgZh.includes('"modelCapabilities"') &&
      msgEn.includes('"adminUsers"') &&
      msgZh.includes('"adminUsers"') &&
      msgEn.includes('"adminTemplates"') &&
      msgZh.includes('"adminTemplates"') &&
      msgEn.includes('"mcpSetup"') &&
      msgZh.includes('"mcpSetup"') &&
      msgEn.includes('"auth"') &&
      msgZh.includes('"auth"');

    const knownHardcoded = [
      authTerminal.includes("[STREAM] Trace ID: trc_8f2a1b92 initializing...") ? "auth-terminal.stream-line" : "",
      authTerminal.includes("aigc billing --usage") ? "auth-terminal.command" : "",
      mcp.includes('"Latency Optimization"') ? "mcp.feature-latency" : "",
      mcp.includes('"Global Gateway"') ? "mcp.feature-gateway" : "",
      mcp.includes('"Retrieves available models"') ? "mcp.tool-desc" : "",
    ].filter(Boolean);

    steps.push({
      name: "AC4 i18n audit (no known hardcoded English residues)",
      ok: i18nWired && i18nKeys && knownHardcoded.length === 0,
      detail: `wired=${i18nWired}, keys=${i18nKeys}, hardcoded=${knownHardcoded.join("|") || "none"}`,
    });

    const passCount = steps.filter((s) => s.ok).length;
    const failCount = steps.length - passCount;
    writeFileSync(OUTPUT, JSON.stringify({ baseUrl: BASE, passCount, failCount, steps }, null, 2));
    if (failCount > 0) {
      console.error(`[r4-design-restoration-verifying] failed: ${failCount} step(s) failed`);
      process.exit(1);
    }
  } catch (err) {
    const detail = err instanceof Error ? err.stack ?? err.message : String(err);
    writeFileSync(
      OUTPUT,
      JSON.stringify(
        {
          baseUrl: BASE,
          passCount: 0,
          failCount: 1,
          steps: [{ name: "script runtime", ok: false, detail }],
        },
        null,
        2,
      ),
    );
    console.error(`[r4-design-restoration-verifying] script error: ${detail}`);
    process.exit(1);
  }
}

void run();

