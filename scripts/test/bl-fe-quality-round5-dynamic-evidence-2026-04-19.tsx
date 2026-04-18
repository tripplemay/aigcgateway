import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import zh from '../../src/messages/zh-CN.json';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3099';
const OUT_DIR = path.resolve('docs/test-reports/perf-raw');
const OUT_JSON = path.join(OUT_DIR, 'bl-fe-quality-round5-dynamic-evidence-2026-04-19.json');

const prisma = new PrismaClient();

async function ensureDir() {
  await fs.mkdir(OUT_DIR, { recursive: true });
}

async function loginToken() {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@aigc-gateway.local', password: 'Codex@2026!' }),
  });
  if (!res.ok) {
    throw new Error(`login failed: ${res.status}`);
  }
  return (await res.json()) as { token: string; user: { id: string; email: string } };
}

async function getLocalAdminUserId() {
  const user = await prisma.user.findUnique({
    where: { email: "admin@aigc-gateway.local" },
    select: { id: true },
  });
  if (!user) throw new Error("local admin user not found in test DB");
  return user.id;
}

async function seedDynamicData(adminUserId: string) {
  const firstActive = await prisma.channel.findFirst({ where: { status: 'ACTIVE' }, select: { id: true } });
  if (firstActive) {
    await prisma.channel.update({ where: { id: firstActive.id }, data: { status: 'DEGRADED' } });
  }
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379/0');
  try {
    const keys = await redis.keys('cache:admin:channels*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } finally {
    await redis.quit();
  }

  const now = Date.now();
  await prisma.notification.deleteMany({ where: { userId: adminUserId } });
  await prisma.notification.createMany({
    data: [
      {
        userId: adminUserId,
        eventType: 'BALANCE_LOW',
        channel: 'INAPP',
        status: 'SENT',
        payload: { currentBalance: 1.23, threshold: 5 },
        createdAt: new Date(now - 65 * 1000),
        sentAt: new Date(now - 65 * 1000),
      },
      {
        userId: adminUserId,
        eventType: 'CHANNEL_DOWN',
        channel: 'INAPP',
        status: 'SENT',
        payload: { providerName: 'MiniMax', modelName: 'abab5.5-chat' },
        createdAt: new Date(now - 2 * 60 * 60 * 1000),
        sentAt: new Date(now - 2 * 60 * 60 * 1000),
      },
    ],
  });

  return { forcedDegradedChannelId: firstActive?.id ?? null };
}

async function collectUiEvidence() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ baseURL: BASE_URL });

  await page.goto('/login');
  await page.fill('input[type="email"]', 'admin@aigc-gateway.local');
  await page.fill('input[type="password"]', 'Codex@2026!');
  await page.keyboard.press('Enter');
  await page.waitForURL('**/dashboard', { timeout: 20000 });

  await page.locator('button:has-text("CN")').first().click();
  await page.waitForTimeout(300);

  const dashboardShot = path.join(OUT_DIR, 'bl-fe-quality-round5-dashboard-zh-2026-04-19.png');
  await page.screenshot({ path: dashboardShot, fullPage: true });

  await page.getByRole('button', { name: /通知|toggle notifications/i }).click();
  await page.waitForTimeout(500);

  const notifShot = path.join(OUT_DIR, 'bl-fe-quality-round5-notifications-zh-2026-04-19.png');
  await page.screenshot({ path: notifShot, fullPage: true });

  const notifPanel = page.locator('div.absolute.right-0.top-12.w-96').first();
  const notifText = await notifPanel.innerText();
  const relativeMatches = (notifText.match(/(\d+\s*分钟前|\d+分钟前|\d+\s*小时前|\d+小时前|\d+\s*秒前|\d+秒前)/g) ?? []).slice(0, 5);

  await page.goto('/admin/models');
  await page.waitForTimeout(800);
  const expand = page.locator('span.material-symbols-outlined', { hasText: 'expand_more' }).first();
  if (await expand.count()) {
    await expand.click();
    await page.waitForTimeout(500);
  }

  const modelsShot = path.join(OUT_DIR, 'bl-fe-quality-round5-admin-models-zh-2026-04-19.png');
  await page.screenshot({ path: modelsShot, fullPage: true });
  const modelsText = await page.locator('body').innerText();

  await page.goto('/admin/operations');
  await page.waitForTimeout(600);
  const operationsShot = path.join(OUT_DIR, 'bl-fe-quality-round5-admin-operations-current-2026-04-19.png');
  await page.screenshot({ path: operationsShot, fullPage: true });

  await page.goto('/admin/logs');
  await page.waitForTimeout(600);
  const logsShot = path.join(OUT_DIR, 'bl-fe-quality-round5-admin-logs-current-2026-04-19.png');
  await page.screenshot({ path: logsShot, fullPage: true });

  await browser.close();

  return {
    dashboardShot,
    notifShot,
    modelsShot,
    operationsShot,
    logsShot,
    notifText,
    relativeMatches,
    modelsText,
    hasLocalizedRelativeTime: relativeMatches.length > 0,
    hasChineseFree: modelsText.includes('免费'),
    hasChineseDegraded: modelsText.includes('降级'),
  };
}

async function main() {
  await ensureDir();
  await loginToken();
  const localAdminId = await getLocalAdminUserId();
  const seeded = await seedDynamicData(localAdminId);
  const ui = await collectUiEvidence();
  const errorI18nKeys = {
    title: zh.error?.title ?? null,
    fallbackMessage: zh.error?.fallbackMessage ?? null,
    retry: zh.error?.retry ?? null,
  };

  const evidence = {
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    seeded,
    checks: {
      tc10_error_zh: {
        pass: false,
        titleOk: !!errorI18nKeys.title,
        fallbackOk: !!errorI18nKeys.fallbackMessage,
        retryOk: !!errorI18nKeys.retry,
        note: 'Unable to trigger console segment error boundary dynamically in this round; kept blocked.',
      },
      tc11_admin_models_i18n: {
        pass: ui.hasChineseFree && ui.hasChineseDegraded,
        hasChineseFree: ui.hasChineseFree,
        hasChineseDegraded: ui.hasChineseDegraded,
        modelsShot: ui.modelsShot,
      },
      tc12_notification_relative_time_i18n: {
        pass: ui.hasLocalizedRelativeTime,
        relativeMatches: ui.relativeMatches,
        notifShot: ui.notifShot,
      },
      tc15_visual_baseline_current_only: {
        pass: true,
        note: 'Collected current screenshots for dashboard/admin-operations/admin-logs; baseline comparison still requires pre-change capture.',
        dashboardShot: ui.dashboardShot,
        operationsShot: ui.operationsShot,
        logsShot: ui.logsShot,
      },
    },
  };

  await fs.writeFile(OUT_JSON, JSON.stringify(evidence, null, 2), 'utf8');
  console.log(JSON.stringify(evidence, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
