import { PrismaClient } from "@prisma/client";
import { readFileSync, writeFileSync } from "fs";
import { spawnSync } from "child_process";
import { requireEnv } from "../lib/require-env";

const BASE = process.env.BASE_URL ?? "http://localhost:3099";
const OUTPUT =
  process.env.OUTPUT_FILE ??
  "docs/test-reports/onboarding-enhance-verifying-local-e2e-2026-04-17.json";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://test:test@localhost:5432/aigc_gateway_test";
const prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@aigc-gateway.local";
const ADMIN_PASSWORD = requireEnv("ADMIN_TEST_PASSWORD");

type Step = { id: string; ok: boolean; detail: string };
type ApiResult = { status: number; body: any; text: string };

function tag() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function text(path: string): string {
  return readFileSync(path, "utf8");
}

async function api(
  path: string,
  init?: RequestInit & { expect?: number | number[] },
): Promise<ApiResult> {
  const { expect, ...rest } = init ?? {};
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(rest.headers as Record<string, string> | undefined),
  };
  const res = await fetch(`${BASE}${path}`, { ...rest, headers, redirect: "manual" });
  const raw = await res.text();
  let body: any = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = raw;
  }

  if (expect !== undefined) {
    const expects = Array.isArray(expect) ? expect : [expect];
    if (!expects.includes(res.status)) {
      throw new Error(`${path} expected ${expects.join("/")} got ${res.status}: ${raw}`);
    }
  }
  return { status: res.status, body, text: raw };
}

async function login(email: string, password: string): Promise<string> {
  const r = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (r.status !== 200) return "";
  return String(r.body?.token ?? "");
}

async function registerAndLogin(prefix: string): Promise<{ email: string; token: string }> {
  const email = `${prefix}_${tag()}@test.local`;
  const password = "Onboard_12345";
  await api("/api/auth/register", {
    method: "POST",
    expect: [200, 201, 409],
    body: JSON.stringify({ email, password, name: prefix }),
  });
  const token = await login(email, password);
  if (!token) throw new Error(`login failed for ${email}`);
  return { email, token };
}

function runSafeRedirectUnit(): { ok: boolean; detail: string } {
  const r = spawnSync("npx", ["vitest", "run", "src/lib/safe-redirect.test.ts"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  return {
    ok: r.status === 0,
    detail: `exit=${r.status} stdout_tail=${(r.stdout || "").slice(-160)} stderr_tail=${(
      r.stderr || ""
    ).slice(-160)}`,
  };
}

async function main() {
  const steps: Step[] = [];
  const adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  if (!adminToken) throw new Error("admin login failed");

  const cfgBefore = await prisma.systemConfig.findUnique({
    where: { key: "WELCOME_BONUS_USD" },
    select: { value: true },
  });
  const originalBonus = String(cfgBefore?.value ?? "1.00");

  try {
    // 1/2/3: welcome bonus register path + disable path.
    await api("/api/admin/config", {
      method: "PUT",
      expect: 200,
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ key: "WELCOME_BONUS_USD", value: "1.00", description: "verifier-set" }),
    });

    const user1 = await registerAndLogin("oe_u1");
    const user1Db = await prisma.user.findUnique({
      where: { email: user1.email },
      select: { id: true, balance: true },
    });
    const bonusTxn1 = user1Db
      ? await prisma.transaction.findFirst({
          where: { userId: user1Db.id, type: "BONUS" as any },
          orderBy: { createdAt: "desc" },
        })
      : null;
    const cfgNow1 = await prisma.systemConfig.findUnique({
      where: { key: "WELCOME_BONUS_USD" },
      select: { value: true },
    });
    const cfgBonusNum = Number(cfgNow1?.value ?? 0);
    const user1Balance = Number(user1Db?.balance ?? 0);
    const bonusAmount1 = Number(bonusTxn1?.amount ?? 0);
    steps.push({
      id: "AC1-register-bonus-balance-and-transaction",
      ok:
        !!user1Db &&
        !!bonusTxn1 &&
        Math.abs(user1Balance - cfgBonusNum) < 0.000001 &&
        Math.abs(bonusAmount1 - cfgBonusNum) < 0.000001,
      detail: `email=${user1.email} cfg=${cfgBonusNum} balance=${user1Balance} bonusTxn=${bonusAmount1}`,
    });

    await api("/api/admin/config", {
      method: "PUT",
      expect: 200,
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ key: "WELCOME_BONUS_USD", value: "0", description: "verifier-set" }),
    });

    const user2 = await registerAndLogin("oe_u2");
    const user2Db = await prisma.user.findUnique({
      where: { email: user2.email },
      select: { id: true, balance: true },
    });
    const bonusTxn2 = user2Db
      ? await prisma.transaction.findFirst({
          where: { userId: user2Db.id, type: "BONUS" as any },
          orderBy: { createdAt: "desc" },
        })
      : null;
    const user2Balance = Number(user2Db?.balance ?? 0);
    steps.push({
      id: "AC2-admin-set-zero-disable-bonus",
      ok: !!user2Db && !bonusTxn2 && Math.abs(user2Balance) < 0.000001,
      detail: `email=${user2.email} balance=${user2Balance} hasBonusTxn=${Boolean(bonusTxn2)}`,
    });

    // 4/5: TEMPLATE_CATEGORIES merge + categories API payload.
    const tplCfg = await prisma.systemConfig.findUnique({
      where: { key: "TEMPLATE_CATEGORIES" },
      select: { value: true },
    });
    let categories: any[] = [];
    try {
      categories = JSON.parse(String(tplCfg?.value ?? "[]"));
    } catch {
      categories = [];
    }
    const ids = new Set((categories ?? []).map((x: any) => String(x?.id ?? "")));
    const required = ["social-content", "short-video", "ip-persona", "marketing-strategy"];
    const hasAllNew = required.every((id) => ids.has(id));
    const hasTen = ids.size >= 10;
    steps.push({
      id: "AC3-template-categories-contains-10-and-4-marketing",
      ok: hasTen && hasAllNew,
      detail: `count=${ids.size} hasAllNew=${hasAllNew}`,
    });

    const catApi = await api("/api/template-categories", {
      expect: 200,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const catRows = Array.isArray(catApi.body?.data) ? catApi.body.data : [];
    const catById = new Map(catRows.map((x: any) => [String(x?.id ?? ""), String(x?.icon ?? "")]));
    const hasTabMarkers =
      catById.get("social-content") === "tag" &&
      catById.get("short-video") === "movie" &&
      catById.get("ip-persona") === "person" &&
      catById.get("marketing-strategy") === "trending_up";
    steps.push({
      id: "AC4-template-library-tab-markers-present",
      ok: hasTabMarkers,
      detail: `apiCount=${catRows.length} iconMappingOk=${hasTabMarkers}`,
    });

    // 6/10: landing links and anchors unchanged.
    const landing = text("public/landing.html");
    const landingLinksOk =
      landing.includes('/login?redirect=%2Fdocs') &&
      landing.includes('/login?redirect=%2Fmcp-setup') &&
      landing.includes('/login?redirect=%2Fmodels');
    const anchorsOk =
      landing.includes('href="#layer-access"') &&
      landing.includes('href="#layer-monitor"') &&
      landing.includes('href="#layer-optimize"');
    steps.push({
      id: "AC5-landing-private-links-to-login-redirect",
      ok: landingLinksOk,
      detail: `linksOk=${landingLinksOk}`,
    });
    steps.push({
      id: "AC6-landing-anchors-still-present",
      ok: anchorsOk,
      detail: `anchorsOk=${anchorsOk}`,
    });

    // 7/9/11: login redirect behavior markers.
    const loginPage = text("src/app/(auth)/login/page.tsx");
    const redirectFlowOk =
      loginPage.includes("sanitizeRedirect") &&
      loginPage.includes("useSearchParams") &&
      loginPage.includes("redirectTarget") &&
      loginPage.includes("router.push(redirectTarget)") &&
      loginPage.includes("router.replace(redirectTarget)");
    const keepsRegisterBehavior = !text("src/app/(auth)/register/page.tsx").includes("redirectTo");
    steps.push({
      id: "AC7-login-redirect-flow-implemented",
      ok: redirectFlowOk,
      detail: `flowMarkers=${redirectFlowOk}`,
    });
    steps.push({
      id: "AC8-register-page-behavior-unchanged",
      ok: keepsRegisterBehavior,
      detail: `unchanged=${keepsRegisterBehavior}`,
    });

    // 8: malicious redirect blocked.
    const safeRedirectTest = runSafeRedirectUnit();
    steps.push({
      id: "AC9-malicious-redirect-blocked-unit",
      ok: safeRedirectTest.ok,
      detail: safeRedirectTest.detail,
    });

    // 2(extra evidence): balance page BONUS green chip markers.
    const balancePage = text("src/app/(console)/balance/page.tsx");
    const bonusChipOk =
      balancePage.includes("BONUS") &&
      balancePage.includes("BONUS: \"success\"") &&
      balancePage.includes("typeBonus");
    steps.push({
      id: "AC10-balance-page-bonus-green-chip",
      ok: bonusChipOk,
      detail: `bonusChipMarkers=${bonusChipOk}`,
    });

    const passCount = steps.filter((s) => s.ok).length;
    const failCount = steps.length - passCount;

    writeFileSync(
      OUTPUT,
      JSON.stringify(
        {
          batch: "ONBOARDING-ENHANCE",
          generatedAt: new Date().toISOString(),
          baseUrl: BASE,
          passCount,
          failCount,
          context: {
            adminEmail: ADMIN_EMAIL,
            welcomeBonusOriginal: originalBonus,
          },
          steps,
        },
        null,
        2,
      ),
    );

    if (failCount > 0) {
      console.error(`[onboarding-enhance-verifying] failed: ${failCount} step(s)`);
      process.exit(1);
    }
  } finally {
    await prisma.systemConfig.upsert({
      where: { key: "WELCOME_BONUS_USD" },
      update: { value: originalBonus, description: "Welcome bonus amount in USD for new users" },
      create: {
        key: "WELCOME_BONUS_USD",
        value: originalBonus,
        description: "Welcome bonus amount in USD for new users",
      },
    });
    await prisma.$disconnect();
  }
}

main().catch(async (err) => {
  console.error(`[onboarding-enhance-verifying] ${err instanceof Error ? err.stack : String(err)}`);
  await prisma.$disconnect();
  process.exit(1);
});
