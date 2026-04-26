import fs from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { chromium } from 'playwright';

const BASE='http://localhost:3099';
const ART=process.argv[2];
const prisma = new PrismaClient();

const admin = await prisma.user.findUnique({ where:{ email:'admin@aigc-gateway.local' }, select:{ id:true } });
if (admin?.id) {
  await prisma.notification.deleteMany({ where:{ userId:admin.id } });
  const now = Date.now();
  await prisma.notification.createMany({ data:[
    { userId:admin.id, eventType:'BALANCE_LOW', channel:'INAPP', status:'SENT', payload:{currentBalance:1.23, threshold:5}, createdAt:new Date(now-5*60*1000), sentAt:new Date(now-5*60*1000) },
    { userId:admin.id, eventType:'CHANNEL_DOWN', channel:'INAPP', status:'SENT', payload:{providerName:'MiniMax', modelName:'abab5.5-chat'}, createdAt:new Date(now-2*60*60*1000), sentAt:new Date(now-2*60*60*1000) }
  ]});
}
await prisma.channel.updateMany({ where:{ status:{ in:['ACTIVE','DISABLED'] } }, data:{ status:'DEGRADED' } });

const browser = await chromium.launch({ headless:true });
const context = await browser.newContext();
const page = await context.newPage();
const consoleErrors=[];
const failed=[];
page.on('console', m => { if (m.type()==='error') consoleErrors.push(m.text()); });
page.on('response', r => { if (r.status()>=400) failed.push({status:r.status(),url:r.url(),type:r.request().resourceType()}); });

await page.goto(`${BASE}/login`, { waitUntil:'domcontentloaded' });
await page.fill('input[type="email"], input[name="email"]', 'admin@aigc-gateway.local');
await page.fill('input[type="password"], input[name="password"]', 'Codex@2026!');
await page.keyboard.press('Enter');
await page.waitForURL('**/dashboard', { timeout: 15000 });

await page.evaluate(() => localStorage.setItem('aigc-locale','zh-CN'));
await page.reload({ waitUntil:'domcontentloaded' });
await page.waitForTimeout(1200);
const dashboardText = await page.locator('body').innerText();
await page.screenshot({ path:`${ART}/dashboard.zhCN.ui2.png`, fullPage:true });

await page.goto(`${BASE}/error-test`, { waitUntil:'domcontentloaded' });
await page.waitForTimeout(800);
const errorText = await page.locator('body').innerText();
await page.screenshot({ path:`${ART}/error-test.zhCN.ui2.png`, fullPage:true });

await page.goto(`${BASE}/admin/models`, { waitUntil:'domcontentloaded' });
await page.waitForTimeout(1500);
const modelsText = await page.locator('body').innerText();
await page.screenshot({ path:`${ART}/admin-models.zhCN.ui2.png`, fullPage:true });

await page.goto(`${BASE}/dashboard`, { waitUntil:'domcontentloaded' });
await page.waitForTimeout(800);
const clicked = await page.evaluate(() => {
  const buttons = Array.from(document.querySelectorAll('button'));
  const hit = buttons.find((b) => {
    const label = (b.getAttribute('aria-label') || '') + ' ' + (b.textContent || '');
    const hasIcon = b.querySelector('.material-symbols-outlined')?.textContent?.includes('notifications');
    return /notification|通知/i.test(label) || hasIcon;
  });
  if (hit) { (hit).click(); return true; }
  return false;
});
if (clicked) await page.waitForTimeout(1000);
const notifText = await page.locator('body').innerText();
await page.screenshot({ path:`${ART}/dashboard-notification.zhCN.ui2.png`, fullPage:true });

const relativeMatches = notifText.match(/(\d+\s*分钟前|\d+分钟前|\d+\s*小时前|\d+小时前|\d+\s*秒前|\d+秒前|刚刚)/g) || [];

const out = {
  dashboard: { hasAppError: dashboardText.includes('Application error'), hasDashboardZh: dashboardText.includes('仪表盘') },
  tc10_error_zh: { pass: errorText.includes('出错') && (errorText.includes('重试') || errorText.includes('返回')), sample:errorText.slice(0,240) },
  tc11_models_zh: { pass: modelsText.includes('免费') && modelsText.includes('降级'), hasFree:modelsText.includes('免费'), hasDegraded:modelsText.includes('降级') },
  tc12_notification_zh: { pass: relativeMatches.length>0, relativeMatches },
  failedReqCount: failed.length,
  consoleErrorCount: consoleErrors.length
};
await fs.writeFile(`${ART}/dynamic-evidence.ui2.json`, JSON.stringify(out, null, 2));
await browser.close();
await prisma.$disconnect();
console.log(JSON.stringify(out,null,2));
