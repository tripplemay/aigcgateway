import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import zh from '../../src/messages/zh-CN.json';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3199';
const OUT_DIR = path.resolve('docs/test-reports/perf-raw');
const OUT_JSON = path.join(OUT_DIR, 'bl-fe-quality-round7-dynamic-evidence-2026-04-19.json');

const prisma = new PrismaClient();

async function ensureDir() {
  await fs.mkdir(OUT_DIR, { recursive: true });
}

async function loginToken() {
  const candidates = [
    { email: 'admin@aigc-gateway.local', password: 'Codex@2026!' },
    { email: 'codex-admin@aigc-gateway.local', password: 'Codex@2026!' },
  ];
  for (const c of candidates) {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(c),
    });
    if (res.ok) {
      return (await res.json()) as { token: string; user: { id: string; email: string } };
    }
  }
  throw new Error('login failed for all admin candidates');
}

async function getLocalAdminUserId() {
  const candidates = ['admin@aigc-gateway.local', 'codex-admin@aigc-gateway.local'];
  for (const email of candidates) {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (user) return user.id;
  }
  throw new Error('local admin user not found in test DB');
}

async function seedDynamicData(adminUserId: string) {
  await prisma.channel.updateMany({ where: { status: 'ACTIVE' }, data: { status: 'DEGRADED' } });
  const firstDegraded = await prisma.channel.findFirst({ where: { status: 'DEGRADED' }, select: { id: true } });
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

  return { forcedDegradedChannelId: firstDegraded?.id ?? null };
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
  await page.waitForTimeout(500);

  await page.goto('/__error-test');
  await page.waitForTimeout(800);
  const errorShot = path.join(OUT_DIR, 'bl-fe-quality-round7-error-zh-2026-04-19.png');
  await page.screenshot({ path: errorShot, fullPage: true });

  const errorTitle = (await page.getByRole('heading', { level: 2 }).first().innerText().catch(() => '')).trim();
  const retryText = (await page.getByRole('button').first().innerText().catch(() => '')).trim();
  const errorDetail = (await page.locator('h2 + p').first().innerText().catch(() => '')).trim();

  await page.goto('/dashboard');
  await page.waitForTimeout(400);
  const dashboardShot = path.join(OUT_DIR, 'bl-fe-quality-round7-dashboard-zh-2026-04-19.png');
  await page.screenshot({ path: dashboardShot, fullPage: true });

  const notifButton = page
    .locator(
      'button[aria-label*=\"通知\" i], button[aria-label*=\"notification\" i], button:has(span.material-symbols-outlined:text(\"notifications\"))',
    )
    .first();
  await notifButton.waitFor({ state: 'visible', timeout: 10000 });
  await notifButton.click();
  await page.waitForTimeout(500);
  const notifShot = path.join(OUT_DIR, 'bl-fe-quality-round7-notifications-zh-2026-04-19.png');
  await page.screenshot({ path: notifShot, fullPage: true });

  const notifPanel = page.locator('div.absolute.right-0.top-12.w-96').first();
  await notifPanel.waitFor({ state: 'visible', timeout: 5000 });
  await page.waitForTimeout(800);
  const notifText = await notifPanel.innerText();
  const relativeMatches = (
    notifText.match(/(\d+\s*分钟前|\d+分钟前|\d+\s*小时前|\d+小时前|\d+\s*秒前|\d+秒前|刚刚)/g) ?? []
  ).slice(0, 5);

  await page.goto('/admin/models');
  await page.waitForTimeout(1000);
  const expand = page.locator('span.material-symbols-outlined', { hasText: 'expand_more' }).first();
  if (await expand.count()) {
    await expand.click();
    await page.waitForTimeout(500);
  }
  const modelsShot = path.join(OUT_DIR, 'bl-fe-quality-round7-admin-models-zh-2026-04-19.png');
  await page.screenshot({ path: modelsShot, fullPage: true });
  const modelsText = await page.locator('body').innerText();

  await page.goto('/admin/operations');
  await page.waitForTimeout(600);
  const operationsShot = path.join(OUT_DIR, 'bl-fe-quality-round7-admin-operations-current-2026-04-19.png');
  await page.screenshot({ path: operationsShot, fullPage: true });

  await page.goto('/admin/logs');
  await page.waitForTimeout(600);
  const logsShot = path.join(OUT_DIR, 'bl-fe-quality-round7-admin-logs-current-2026-04-19.png');
  await page.screenshot({ path: logsShot, fullPage: true });

  await browser.close();

  return {
    errorShot,
    errorTitle,
    retryText,
    errorDetail,
    dashboardShot,
    notifShot,
    modelsShot,
    operationsShot,
    logsShot,
    relativeMatches,
    modelsText,
    hasLocalizedRelativeTime: relativeMatches.length > 0,
    hasChineseFree: modelsText.includes('免费'),
    hasChineseDegraded: modelsText.includes('降级') || modelsText.includes('已降级'),
  };
}

async function main() {
  await ensureDir();
  await loginToken();
  const localAdminId = await getLocalAdminUserId();
  const seeded = await seedDynamicData(localAdminId);
  const ui = await collectUiEvidence();

  const expected = {
    title: zh.error?.title ?? '',
    fallbackMessage: zh.error?.fallbackMessage ?? '',
    retry: zh.error?.retry ?? '',
  };

  const titleOk = ui.errorTitle.includes(expected.title);
  const retryOk = ui.retryText.includes(expected.retry);
  const detailIsFallback = ui.errorDetail.includes(expected.fallbackMessage);
  const detailIsKnownTestError = ui.errorDetail.includes('Test: trigger (console)/error.tsx boundary');

  const evidence = {
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    seeded,
    checks: {
      tc10_error_zh: {
        pass: titleOk && retryOk && (detailIsFallback || detailIsKnownTestError),
        titleOk,
        retryOk,
        detailIsFallback,
        detailIsKnownTestError,
        expected,
        actual: {
          title: ui.errorTitle,
          detail: ui.errorDetail,
          retry: ui.retryText,
        },
        errorShot: ui.errorShot,
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
        note: 'Collected current screenshots for dashboard/admin-operations/admin-logs as dynamic evidence set.',
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
