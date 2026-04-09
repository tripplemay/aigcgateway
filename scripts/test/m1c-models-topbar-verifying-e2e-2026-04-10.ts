import { readFileSync, writeFileSync } from "fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3099";
const OUTPUT =
  process.env.OUTPUT_FILE ?? "docs/test-reports/m1c-models-topbar-verifying-e2e-2026-04-10.json";

type Step = { id: string; name: string; ok: boolean; detail: string };

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
  if (expect && res.status !== expect) {
    throw new Error(`${path} expected ${expect}, got ${res.status}: ${JSON.stringify(body)}`);
  }
  return { status: res.status, body };
}

function checkModelsDesignParity(modelsPage: string): { ok: boolean; notes: string[] } {
  const notes: string[] = [];
  const mustContain = [
    "const grouped = useMemo",
    "const brand = m.brand || t(\"otherModels\")",
    "Sort: named brands first alphabetically, \"Other\" last",
    "<table",
    "{t(\"modelId\")}",
    "{t(\"modality\")}",
    "{t(\"context\")}",
    "{t(\"price\")}",
  ];
  for (const key of mustContain) {
    if (!modelsPage.includes(key)) notes.push(`missing:${key}`);
  }
  return { ok: notes.length === 0, notes };
}

function checkTopbarCleanup(topbar: string): { ok: boolean; notes: string[] } {
  const notes: string[] = [];
  // Only flag concrete UI traces, not comments/translations.
  const removedUiSignals = [
    { key: "deploy-link", pattern: 'href="/deploy"' },
    { key: "search-input-type", pattern: 'type="search"' },
    { key: "search-placeholder-key", pattern: 't("searchPlaceholder")' },
    { key: "dark-mode-icon", pattern: "dark_mode" },
  ];
  for (const item of removedUiSignals) {
    if (topbar.includes(item.pattern)) notes.push(`unexpected:${item.key}`);
  }
  // settings entry should exist only in dropdown as Link /settings
  const settingsCount = (topbar.match(/settings/g) ?? []).length;
  if (settingsCount < 1) notes.push("missing:settings-menu");
  if (!topbar.includes('href="/settings"')) notes.push("missing:/settings-link");
  if (!topbar.includes("handleSignOut")) notes.push("missing:signout-handler");
  if (!topbar.includes("localStorage.removeItem(\"token\")")) notes.push("missing:clear-local-token");
  if (!topbar.includes("document.cookie = \"token=; path=/; max-age=0\"")) notes.push("missing:clear-cookie-token");

  return { ok: notes.length === 0, notes };
}

function checkAuthTerminalEnglish(loginPage: string, registerPage: string): { ok: boolean; notes: string[] } {
  const notes: string[] = [];
  const requiredEnglishSnippets = [
    "aigc chat --model deepseek/v3 --stream \"Analyze efficiency\"",
    "[SUCCESS] Connection established with deepseek/v3",
    "terminalTitle=\"aigc-cli — bash\"",
    "uptime=\"Uptime\"",
    "latency=\"Latency\"",
  ];
  const merged = `${loginPage}\n${registerPage}`;
  for (const s of requiredEnglishSnippets) {
    if (!merged.includes(s)) notes.push(`missing:${s}`);
  }
  if (merged.includes("连接已建立") || merged.includes("查询中") || merged.includes("耗时")) {
    notes.push("unexpected:non-english-terminal-sequence");
  }
  return { ok: notes.length === 0, notes };
}

function checkDsTokenAndI18n(modelsPage: string, topbar: string): { dsOk: boolean; i18nOk: boolean; notes: string[] } {
  const notes: string[] = [];
  const merged = `${modelsPage}\n${topbar}`;
  // Allow external brand identity colors in BRAND_COLORS map only.
  const modelsWithoutBrandColorMap = modelsPage.replace(
    /const BRAND_COLORS:[\s\S]*?};/m,
    "const BRAND_COLORS: Record<string, string> = {};",
  );
  const dsAuditText = `${modelsWithoutBrandColorMap}\n${topbar}`;

  // DS token audit: no hardcoded hex/rgb in M1c touched pages
  const hexMatches = dsAuditText.match(/#[0-9A-Fa-f]{3,8}/g) ?? [];
  if (hexMatches.length > 0) notes.push(`hardcoded-hex:${[...new Set(hexMatches)].join(",")}`);

  // i18n residue: topbar/models should avoid hardcoded chinese; keep known technical words allowed
  const disallowedLiterals = [
    "模型",
    "搜索模型",
    "部署",
    "设置",
    "退出登录",
  ];
  for (const lit of disallowedLiterals) {
    if (merged.includes(lit)) notes.push(`hardcoded-locale:${lit}`);
  }

  // known raw color utility classes should not appear on these pages
  const rawColorClasses = [
    "text-slate-",
    "bg-slate-",
    "text-amber-",
    "bg-amber-",
    "text-indigo-",
    "bg-indigo-",
    "text-emerald-",
    "bg-emerald-",
  ];
  const colorHits = rawColorClasses.filter((c) => dsAuditText.includes(c));
  if (colorHits.length > 0) notes.push(`raw-color-class:${colorHits.join(",")}`);

  const dsOk = !notes.some((n) => n.startsWith("hardcoded-hex") || n.startsWith("raw-color-class"));
  const i18nOk = !notes.some((n) => n.startsWith("hardcoded-locale"));

  return { dsOk, i18nOk, notes };
}

async function run() {
  const steps: Step[] = [];

  // AC1: /v1/models returns alias-style list without provider leakage
  const modelsRes = await api("/v1/models", { expect: 200 });
  const data = Array.isArray(modelsRes.body?.data) ? modelsRes.body.data : [];
  const hasProviderNameLeak = data.some((m: any) => Object.prototype.hasOwnProperty.call(m, "provider_name"));
  const dataShapeValid = data.every(
    (m: any) => typeof m?.id === "string" && (m.brand === undefined || typeof m.brand === "string"),
  );
  steps.push({
    id: "AC1",
    name: "Models API exposes alias list without provider info",
    ok: modelsRes.status === 200 && !hasProviderNameLeak && dataShapeValid,
    detail: `status=${modelsRes.status}, count=${data.length}, provider_name_leak=${hasProviderNameLeak}, shape_valid=${dataShapeValid}`,
  });

  const modelsPage = readFileSync("src/app/(console)/models/page.tsx", "utf8");
  const topbar = readFileSync("src/components/top-app-bar.tsx", "utf8");
  const loginPage = readFileSync("src/app/(auth)/login/page.tsx", "utf8");
  const registerPage = readFileSync("src/app/(auth)/register/page.tsx", "utf8");

  const design = checkModelsDesignParity(modelsPage);
  steps.push({
    id: "AC1-design",
    name: "Models page brand grouping + table structure matches key design requirements",
    ok: design.ok,
    detail: design.ok ? "matched" : design.notes.join(" | "),
  });

  const topbarCheck = checkTopbarCleanup(topbar);
  steps.push({
    id: "AC2",
    name: "Topbar cleaned and avatar dropdown usable (settings + signout)",
    ok: topbarCheck.ok,
    detail: topbarCheck.ok ? "clean" : topbarCheck.notes.join(" | "),
  });

  const terminal = checkAuthTerminalEnglish(loginPage, registerPage);
  steps.push({
    id: "AC4",
    name: "Auth terminal stays English under any locale",
    ok: terminal.ok,
    detail: terminal.ok ? "english-fixed" : terminal.notes.join(" | "),
  });

  const audit = checkDsTokenAndI18n(modelsPage, topbar);
  steps.push({
    id: "AC5",
    name: "DS token consistency",
    ok: audit.dsOk,
    detail: audit.dsOk ? "clean" : audit.notes.join(" | "),
  });

  steps.push({
    id: "AC6",
    name: "i18n residue audit",
    ok: audit.i18nOk,
    detail: audit.i18nOk ? "clean" : audit.notes.join(" | "),
  });

  const passCount = steps.filter((s) => s.ok).length;
  const failCount = steps.length - passCount;

  const result = {
    batch: "M1c-models-page-topbar-cleanup",
    feature: "F-M1c-06",
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
