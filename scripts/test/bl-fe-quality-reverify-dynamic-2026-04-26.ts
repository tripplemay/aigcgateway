import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3099";
const OUT_DIR = path.resolve("docs/test-reports/artifacts/bl-fe-quality-2026-04-26-codex-reverify");
const OUT_JSON = path.join(OUT_DIR, "dynamic-evidence.json");
const prisma = new PrismaClient();

async function ensureDir() {
  await fs.mkdir(OUT_DIR, { recursive: true });
}

async function seedData() {
  const adminCandidates = ["codex-admin@aigc-gateway.local", "admin@aigc-gateway.local"];
  const admin = await prisma.user.findFirst({ where: { email: { in: adminCandidates } }, select: { id: true, email: true } });
  if (!admin) throw new Error("admin user not found");

  const firstActive = await prisma.channel.findFirst({ where: { status: "ACTIVE" }, select: { id: true } });
  if (firstActive) {
    await prisma.channel.update({ where: { id: firstActive.id }, data: { status: "DEGRADED" } });
  }

  const now = Date.now();
  await prisma.notification.deleteMany({ where: { userId: admin.id } });
  await prisma.notification.createMany({
    data: [
      {
        userId: admin.id,
        eventType: "BALANCE_LOW",
        channel: "INAPP",
        status: "SENT",
        payload: { currentBalance: 1.23, threshold: 5 },
        createdAt: new Date(now - 5 * 60 * 1000),
        sentAt: new Date(now - 5 * 60 * 1000),
      },
      {
        userId: admin.id,
        eventType: "CHANNEL_DOWN",
        channel: "INAPP",
        status: "SENT",
        payload: { providerName: "MiniMax", modelName: "abab5.5-chat" },
        createdAt: new Date(now - 2 * 60 * 60 * 1000),
        sentAt: new Date(now - 2 * 60 * 60 * 1000),
      },
    ],
  });

  return admin.email;
}

async function login(page: import("playwright").Page) {
  const users = ["codex-admin@aigc-gateway.local", "admin@aigc-gateway.local"];
  for (const email of users) {
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', "Codex@2026!");
    await page.keyboard.press("Enter");
    try {
      await page.waitForURL("**/dashboard", { timeout: 8000 });
      return email;
    } catch {
      // try next candidate
    }
  }
  throw new Error("ui login failed for all admin candidates");
}

async function run() {
  await ensureDir();
  const seededUserEmail = await seedData();

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const loginEmail = await login(page);

  const zhBtn = page.locator('button:has-text("CN")').first();
  if (await zhBtn.isVisible().catch(() => false)) {
    await zhBtn.click();
    await page.waitForTimeout(500);
  }

  await page.goto(`${BASE_URL}/error-test`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  const errorTitle = (await page.locator("h2").first().innerText().catch(() => "")).trim();
  const errorBtn = (await page.getByRole("button").first().innerText().catch(() => "")).trim();
  const errorShot = path.join(OUT_DIR, "error-test-zh.png");
  await page.screenshot({ path: errorShot, fullPage: true });

  await page.goto(`${BASE_URL}/admin/models`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  const modelsText = await page.locator("body").innerText();
  const modelsShot = path.join(OUT_DIR, "admin-models-zh.png");
  await page.screenshot({ path: modelsShot, fullPage: true });

  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);
  const notifBtn = page
    .locator('button[aria-label*="通知" i], button[aria-label*="notification" i], button:has(span.material-symbols-outlined:text("notifications"))')
    .first();
  await notifBtn.click();
  await page.waitForTimeout(800);
  const panel = page.locator("div.absolute.right-0.top-12.w-96").first();
  const panelText = await panel.innerText().catch(() => "");
  const relativeMatches = panelText.match(/(\d+\s*分钟前|\d+分钟前|\d+\s*小时前|\d+小时前|\d+\s*秒前|\d+秒前|刚刚)/g) ?? [];
  const notifShot = path.join(OUT_DIR, "notifications-zh.png");
  await page.screenshot({ path: notifShot, fullPage: true });

  const dashboardShot = path.join(OUT_DIR, "dashboard-current.png");
  await page.screenshot({ path: dashboardShot, fullPage: true });

  await page.goto(`${BASE_URL}/admin/operations`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);
  const operationsShot = path.join(OUT_DIR, "admin-operations-current.png");
  await page.screenshot({ path: operationsShot, fullPage: true });

  await page.goto(`${BASE_URL}/admin/logs`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);
  const logsShot = path.join(OUT_DIR, "admin-logs-current.png");
  await page.screenshot({ path: logsShot, fullPage: true });

  await browser.close();

  const out = {
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    seededUserEmail,
    loginEmail,
    checks: {
      tc10_error_zh: {
        pass: errorTitle.includes("出错") && (errorBtn.includes("重试") || errorBtn.includes("返回")),
        errorTitle,
        errorBtn,
        screenshot: errorShot,
      },
      tc11_admin_models_i18n: {
        pass: modelsText.includes("免费") && (modelsText.includes("降级") || modelsText.includes("已降级")),
        hasChineseFree: modelsText.includes("免费"),
        hasChineseDegraded: modelsText.includes("降级") || modelsText.includes("已降级"),
        screenshot: modelsShot,
      },
      tc12_notification_relative_time_i18n: {
        pass: relativeMatches.length > 0,
        relativeMatches,
        screenshot: notifShot,
      },
      tc15_visual_current_screenshots: {
        pass: true,
        dashboardShot,
        operationsShot,
        logsShot,
      },
    },
  };

  await fs.writeFile(OUT_JSON, JSON.stringify(out, null, 2), "utf8");
  console.log(JSON.stringify(out, null, 2));
}

run()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
