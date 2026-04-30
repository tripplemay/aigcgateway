import { readFileSync, writeFileSync } from "node:fs";
import { requireEnv } from "../lib/require-env";

const BASE = process.env.BASE_URL ?? "http://localhost:3199";
const OUTPUT =
  process.env.OUTPUT_FILE ?? "docs/test-reports/ui-unify-fix-fuf06-verifying-e2e-2026-04-13.json";

type Step = { id: string; ok: boolean; detail: string };

const pages = {
  dashboard: "src/app/(console)/dashboard/page.tsx",
  balance: "src/app/(console)/balance/page.tsx",
  models: "src/app/(console)/models/page.tsx",
  keys: "src/app/(console)/keys/page.tsx",
  logs: "src/app/(console)/logs/page.tsx",
  usage: "src/app/(console)/usage/page.tsx",
  actions: "src/app/(console)/actions/page.tsx",
  templates: "src/app/(console)/templates/page.tsx",
  settings: "src/app/(console)/settings/page.tsx",
  "mcp-setup": "src/app/(console)/mcp-setup/page.tsx",
  quickstart: "src/app/(console)/quickstart/page.tsx",
  docs: "src/app/(console)/docs/page.tsx",
};

function flatten<T>(arr: T[][]): T[] {
  return ([] as T[]).concat(...arr);
}

function read(path: string) {
  return readFileSync(path, "utf8");
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
    throw new Error(`${path}: expected ${expected}, got ${res.status}, body=${text.slice(0, 200)}`);
  }
  return { status: res.status, body, text };
}

async function run() {
  const steps: Step[] = [];
  const contents = Object.fromEntries(Object.entries(pages).map(([k, p]) => [k, read(p)])) as Record<
    string,
    string
  >;

  // AC1: size selection
  const settings = contents.settings;
  const mcpSetup = contents["mcp-setup"];
  const settingsOk = settings.includes("<PageContainer") && !settings.includes('size="narrow"');
  const mcpOk = mcpSetup.includes('<PageContainer size="narrow"');
  steps.push({
    id: "F-UF-06-AC1-page-container-size",
    ok: settingsOk && mcpOk,
    detail: `settingsDefault=${settingsOk}, mcpSetupNarrow=${mcpOk}`,
  });

  // AC2: no PageHeader badge in 12 console pages
  const badgeHits = Object.entries(contents)
    .filter(([, c]) => c.includes("badge=") && c.includes("<PageHeader"))
    .map(([k]) => k);
  steps.push({
    id: "F-UF-06-AC2-no-pageheader-badge",
    ok: badgeHits.length === 0,
    detail: `badgeHits=${badgeHits.length}${badgeHits.length ? `:${badgeHits.join(",")}` : ""}`,
  });

  // AC3: keys create button in PageHeader.actions + gradient-primary
  const keys = contents.keys;
  const headerActionOk = keys.includes("<PageHeader") && keys.includes("actions={") && keys.includes("setCreateOpen(true)");
  const keyBtnGradient = keys.includes('variant="gradient-primary"');
  steps.push({
    id: "F-UF-06-AC3-keys-header-action",
    ok: headerActionOk && keyBtnGradient,
    detail: `headerAction=${headerActionOk}, gradientPrimary=${keyBtnGradient}`,
  });

  // AC4: no hand-written heading combos; required pages include heading tool class
  const allText = flatten(Object.values(contents).map((x) => [x])).join("\n\n");
  const badHeadingMatches = allText.match(/<h2[^>]*text-(xl|lg)[^>]*font-(bold|extrabold)/g) ?? [];
  const requiredHeadingPages = ["settings", "models", "templates", "balance", "quickstart", "mcp-setup"];
  const missingHeading = requiredHeadingPages.filter((k) => {
    const c = contents[k];
    return !(c.includes("heading-2") || c.includes("heading-3"));
  });
  steps.push({
    id: "F-UF-06-AC4-heading-tool-classes",
    ok: badHeadingMatches.length === 0 && missingHeading.length === 0,
    detail: `badHeadingMatches=${badHeadingMatches.length}, missingHeadingPages=${missingHeading.length}${missingHeading.length ? `:${missingHeading.join(",")}` : ""}`,
  });

  // AC5: main buttons use gradient-primary; remove bg-ds-primary text-white in main button contexts
  const badPrimary = Object.entries(contents)
    .flatMap(([k, c]) => {
      const hits = c.match(/bg-ds-primary text-white/g) ?? [];
      return hits.map(() => k);
    })
    .filter((k) => k !== "balance");
  const requiredGradientPages = ["keys", "balance", "settings", "mcp-setup"];
  const missingGradient = requiredGradientPages.filter((k) => !contents[k].includes('gradient-primary'));
  steps.push({
    id: "F-UF-06-AC5-gradient-primary-buttons",
    ok: badPrimary.length === 0 && missingGradient.length === 0,
    detail: `badPrimaryHits=${badPrimary.length}${badPrimary.length ? `:${badPrimary.join(",")}` : ""}, missingGradient=${missingGradient.length}${missingGradient.length ? `:${missingGradient.join(",")}` : ""}`,
  });

  // AC6: 12-page runtime visibility (with admin token)
  const login = await api("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@aigc-gateway.local", password: requireEnv("ADMIN_TEST_PASSWORD") }),
    expected: 200,
  });
  const token = String(login.body?.token ?? "");
  if (!token) throw new Error("admin token missing");

  const routes = [
    "/dashboard",
    "/balance",
    "/models",
    "/keys",
    "/logs",
    "/usage",
    "/actions",
    "/templates",
    "/settings",
    "/mcp-setup",
    "/quickstart",
    "/docs",
  ];
  const failedRoutes: string[] = [];
  for (const r of routes) {
    const res = await fetch(`${BASE}${r}`, {
      headers: { Authorization: `Bearer ${token}` },
      redirect: "manual",
    });
    if (res.status !== 200) failedRoutes.push(`${r}:${res.status}`);
  }
  steps.push({
    id: "F-UF-06-AC6-visual-runtime-smoke-12pages",
    ok: failedRoutes.length === 0,
    detail: `failedRoutes=${failedRoutes.length}${failedRoutes.length ? `:${failedRoutes.join(",")}` : ""}`,
  });

  const failCount = steps.filter((s) => !s.ok).length;
  const summary = {
    feature: "F-UF-06",
    batch: "UI-UNIFY-FIX",
    env: "L1-local-3199",
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    pass: failCount === 0,
    passCount: steps.length - failCount,
    failCount,
    steps,
  };

  writeFileSync(OUTPUT, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  if (failCount > 0) {
    console.error(`F-UF-06 FAIL: ${steps.filter((s) => !s.ok).map((s) => s.id).join(", ")}`);
    process.exit(1);
  }

  console.log(`F-UF-06 PASS: ${summary.passCount}/${steps.length}`);
  console.log(`Report: ${OUTPUT}`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
