import "../../tests/helpers/load-test-env";
import { readFileSync, writeFileSync } from "fs";
import { createTestProject, createTestUser } from "../../tests/factories";

const BASE = process.env.BASE_URL ?? "http://localhost:3099";
const OUTPUT =
  process.env.OUTPUT_FILE ?? "docs/test-reports/ui-unify-verifying-local-e2e-2026-04-13.json";

type Step = { id: string; ok: boolean; detail: string };

let token = "";
let projectId = "";

const targetPages = [
  "src/app/(console)/actions/page.tsx",
  "src/app/(console)/templates/page.tsx",
  "src/app/(console)/keys/page.tsx",
  "src/app/(console)/models/page.tsx",
  "src/app/(console)/logs/page.tsx",
  "src/app/(console)/usage/page.tsx",
  "src/app/(console)/balance/page.tsx",
  "src/app/(console)/dashboard/page.tsx",
  "src/app/(console)/settings/page.tsx",
  "src/app/(console)/docs/page.tsx",
  "src/app/(console)/quickstart/page.tsx",
  "src/app/(console)/mcp-setup/page.tsx",
];

function text(path: string) {
  return readFileSync(path, "utf8");
}

async function api(path: string, init?: RequestInit & { expect?: number }) {
  const { expect, ...rest } = init ?? {};
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(rest.headers as Record<string, string> | undefined),
  };
  if (token) headers.authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...rest, headers, redirect: "manual" });
  const raw = await res.text();
  let body: any = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = raw;
  }
  if (typeof expect === "number" && res.status !== expect) {
    throw new Error(`${path} expected ${expect}, got ${res.status}: ${JSON.stringify(body)}`);
  }
  return { status: res.status, body, raw };
}

async function step(id: string, out: Step[], fn: () => Promise<string>) {
  try {
    out.push({ id, ok: true, detail: await fn() });
  } catch (e) {
    out.push({ id, ok: false, detail: (e as Error).message });
  }
}

async function prepareProject() {
  const user = await createTestUser(BASE, { prefix: "uiunify", name: "UI Unify Tester" });
  token = user.token;
  const project = await createTestProject(BASE, token, { name: `UI-UNIFY ${Date.now()}` });
  projectId = project.id;
}

async function main() {
  const steps: Step[] = [];
  await prepareProject();

  await step("F-UU-01~06-components-exist", steps, async () => {
    const files = [
      "src/components/page-container.tsx",
      "src/components/page-header.tsx",
      "src/components/table-card.tsx",
      "src/components/table-loader.tsx",
      "src/components/kpi-card.tsx",
      "src/components/status-chip.tsx",
      "src/components/cta-banner.tsx",
      "src/components/section-card.tsx",
      "src/components/page-loader.tsx",
      "src/components/empty-state.tsx",
    ];
    for (const f of files) {
      const c = text(f);
      if (c.length < 100) throw new Error(`${f} seems empty`);
    }
    const button = text("src/components/ui/button.tsx");
    if (!button.includes('"gradient-primary"')) throw new Error("Button gradient-primary variant missing");
    return `components=${files.length}, gradient-primary=ok`;
  });

  await step("F-UU-12-heading-scale-docs", steps, async () => {
    const css = text("src/app/globals.css");
    for (const cls of [".heading-1", ".heading-2", ".heading-3"]) {
      if (!css.includes(cls)) throw new Error(`${cls} missing in globals.css`);
    }
    const layout = text("design-draft/Layout Shell - AIGC Gateway/PAGE-LAYOUT.md");
    if (!layout.includes("PageContainer") || !layout.includes("PageHeader")) {
      throw new Error("PAGE-LAYOUT.md missing component conventions");
    }
    return "heading utilities + PAGE-LAYOUT present";
  });

  await step("F-UU-07~11-12-pages-use-shell", steps, async () => {
    const missing: string[] = [];
    const narrowRequired = new Set([
      "src/app/(console)/settings/page.tsx",
      "src/app/(console)/docs/page.tsx",
      "src/app/(console)/quickstart/page.tsx",
    ]);
    for (const page of targetPages) {
      const c = text(page);
      if (!c.includes("PageContainer")) missing.push(`${page}:PageContainer`);
      if (!c.includes("PageHeader")) missing.push(`${page}:PageHeader`);
      if (narrowRequired.has(page) && !c.includes('size="narrow"')) {
        missing.push(`${page}:narrow-size`);
      }
      if (!narrowRequired.has(page) && page !== "src/app/(console)/models/page.tsx") {
        // default pages should not hardcode max-w classes at top shell
        if (c.includes("max-w-4xl") || c.includes("max-w-5xl") || c.includes("max-w-6xl")) {
          missing.push(`${page}:legacy-max-width`);
        }
      }
    }
    if (missing.length) throw new Error(`shell mismatches: ${missing.join(", ")}`);
    return `checked=${targetPages.length}`;
  });

  await step("BL-121-models-show-all-button-onClick", steps, async () => {
    const models = text("src/app/(console)/models/page.tsx");
    if (!models.includes("showAllModels")) throw new Error("showAll state missing");
    if (!models.includes("setShowAllModels")) throw new Error("showAll setter missing");
    if (!models.includes("onClick={() =>")) throw new Error("no button onClick found");
    if (!models.includes("showAll") && !models.includes("showAllTotal")) {
      throw new Error("show-all UI labels missing");
    }
    return "show-all toggle wiring present";
  });

  await step("BL-122-actions-templates-loading-guard", steps, async () => {
    const actions = text("src/app/(console)/actions/page.tsx");
    const templates = text("src/app/(console)/templates/page.tsx");
    if (!actions.includes("BL-122")) throw new Error("actions BL-122 markers missing");
    if (!actions.includes("PageLoader")) throw new Error("actions PageLoader missing");
    if (!actions.includes("TableLoader")) throw new Error("actions TableLoader missing");
    if (!templates.includes("BL-122")) throw new Error("templates BL-122 markers missing");
    if (!templates.includes("TableLoader")) throw new Error("templates TableLoader missing");
    return "actions/templates loading guards present";
  });

  await step("BL-123-templates-pill-tabs", steps, async () => {
    const templates = text("src/app/(console)/templates/page.tsx");
    if (!templates.includes("BL-123")) throw new Error("BL-123 marker missing");
    if (!templates.includes("templates-pill-tabs")) throw new Error("pill tabs testid missing");
    if (!templates.includes('searchParams.get("tab")')) throw new Error("tab query sync read missing");
    if (!templates.includes('params.set("tab", "library")')) throw new Error("tab query sync write missing");
    if (!templates.includes("rounded-lg text-sm font-bold")) throw new Error("pill style class missing");
    return "pill tabs + URL sync present";
  });

  await step("regression-tests-covered-in-scripts-e2e-test", steps, async () => {
    const e2e = text("scripts/e2e-test.ts");
    for (const marker of [
      "16. BL-122 actions list envelope",
      "17. BL-122 templates list envelope",
      "18. BL-121 models brand field",
      "19. BL-123 templates tab sources",
    ]) {
      if (!e2e.includes(marker)) throw new Error(`missing e2e marker: ${marker}`);
    }
    return "steps 16~19 present";
  });

  await step("BL-122-api-actions-templates-envelope-runtime", steps, async () => {
    const a = await api(`/api/projects/${projectId}/actions?page=1&pageSize=20`, { expect: 200 });
    const t = await api(`/api/projects/${projectId}/templates?page=1&pageSize=20`, { expect: 200 });
    const aOk = Array.isArray(a.body?.data) && typeof a.body?.pagination?.total === "number";
    const tOk = Array.isArray(t.body?.data) && typeof t.body?.pagination?.total === "number";
    if (!aOk || !tOk) {
      throw new Error(
        `envelope invalid: actions=${JSON.stringify(a.body)} templates=${JSON.stringify(t.body)}`,
      );
    }
    return `actions.total=${a.body.pagination.total}, templates.total=${t.body.pagination.total}`;
  });

  await step("BL-121-runtime-v1-models-brand", steps, async () => {
    const res = await fetch(`${BASE}/v1/models`);
    if (!res.ok) throw new Error(`/v1/models HTTP ${res.status}`);
    const body = await res.json();
    if (!Array.isArray(body?.data)) throw new Error("models response missing data array");
    if (body.data.length === 0) {
      // L1 fresh DB may have empty alias data before sync/import; step18 coverage is enforced by scripts/e2e-test.ts.
      return "models=0 (accepted in L1); brand regression covered by scripts/e2e-test.ts step18";
    }
    const branded = body.data.filter((m: any) => typeof m.brand === "string" && m.brand.length > 0).length;
    if (branded === 0) throw new Error("no model has brand field");
    return `models=${body.data.length}, branded=${branded}`;
  });

  await step("BL-123-runtime-public-templates-source", steps, async () => {
    const pub = await fetch(`${BASE}/api/templates/public`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!pub.ok) throw new Error(`public templates HTTP ${pub.status}`);
    const body = await pub.json();
    if (!Array.isArray(body?.data) && !Array.isArray(body)) {
      throw new Error(`public templates payload unexpected: ${JSON.stringify(body)}`);
    }
    return "public templates endpoint ok";
  });

  const pass = steps.filter((s) => s.ok).length;
  const fail = steps.length - pass;
  const report = {
    batch: "UI-UNIFY",
    generatedAt: new Date().toISOString(),
    environment: BASE,
    pass,
    fail,
    checks: steps,
  };
  writeFileSync(OUTPUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  const report = {
    batch: "UI-UNIFY",
    generatedAt: new Date().toISOString(),
    environment: BASE,
    pass: 0,
    fail: 1,
    fatal: (err as Error).stack ?? String(err),
    checks: [] as Step[],
  };
  writeFileSync(OUTPUT, JSON.stringify(report, null, 2));
  console.error((err as Error).stack ?? String(err));
  process.exit(1);
});
