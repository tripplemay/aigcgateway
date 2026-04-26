import fs from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { chromium } from 'playwright';

const BASE='http://localhost:3099';
const ART=process.argv[2];
const prisma = new PrismaClient();

const loginResp = await fetch(`${BASE}/api/auth/login`, {
  method:'POST', headers:{'content-type':'application/json'},
  body: JSON.stringify({email:'admin@aigc-gateway.local', password:'Codex@2026!'})
});
const login = await loginResp.json();
if (!login.token) throw new Error('login token missing');

const admin = await prisma.user.findUnique({ where:{ email:'admin@aigc-gateway.local' }, select:{ id:true } });
if (admin?.id) {
  await prisma.notification.deleteMany({ where:{ userId:admin.id } });
  const now = Date.now();
  await prisma.notification.createMany({ data:[
    { userId:admin.id, eventType:'BALANCE_LOW', channel:'INAPP', status:'SENT', payload:{currentBalance:1.23, threshold:5}, createdAt:new Date(now-5*60*1000), sentAt:new Date(now-5*60*1000) },
    { userId:admin.id, eventType:'CHANNEL_DOWN', channel:'INAPP', status:'SENT', payload:{providerName:'MiniMax', modelName:'abab5.5-chat'}, createdAt:new Date(now-2*60*60*1000), sentAt:new Date(now-2*60*60*1000) }
  ]});
}
const firstActive = await prisma.channel.findFirst({ where:{ status:'ACTIVE' }, select:{ id:true } });
if (firstActive?.id) await prisma.channel.update({ where:{ id:firstActive.id }, data:{ status:'DEGRADED' } });

const browser = await chromium.launch({ headless:true });
const context = await browser.newContext();
const page = await context.newPage();
const consoleErrors=[];
const failed=[];
page.on('console', m => { if (m.type()==='error') consoleErrors.push(m.text()); });
page.on('response', r => { if (r.status()>=400) failed.push({status:r.status(),url:r.url(),type:r.request().resourceType()}); });

await page.addInitScript((t)=>{ localStorage.setItem('token', t); localStorage.setItem('aigc-locale','zh-CN'); }, login.token);

await page.goto(`${BASE}/dashboard`, { waitUntil:'domcontentloaded' });
await page.waitForTimeout(1200);
const dashboardText = await page.locator('body').innerText();
await page.screenshot({ path:`${ART}/dashboard.zhCN.png`, fullPage:true });

await page.goto(`${BASE}/error-test`, { waitUntil:'domcontentloaded' });
await page.waitForTimeout(800);
const errorText = await page.locator('body').innerText();
await page.screenshot({ path:`${ART}/error-test.zhCN.png`, fullPage:true });

await page.goto(`${BASE}/admin/models`, { waitUntil:'domcontentloaded' });
await page.waitForTimeout(1200);
const modelsText = await page.locator('body').innerText();
await page.screenshot({ path:`${ART}/admin-models.zhCN.png`, fullPage:true });

await page.goto(`${BASE}/dashboard`, { waitUntil:'domcontentloaded' });
await page.waitForTimeout(800);
const notifBtn = page.locator('button[aria-label*="Notifications" i], button[aria-label*="通知" i]').first();
if (await notifBtn.count()) { await notifBtn.click().catch(()=>{}); await page.waitForTimeout(900); }
const notifText = await page.locator('body').innerText();
await page.screenshot({ path:`${ART}/dashboard-notification.zhCN.png`, fullPage:true });

const relativeMatches = notifText.match(/(\d+\s*分钟前|\d+分钟前|\d+\s*小时前|\d+小时前|\d+\s*秒前|\d+秒前|刚刚)/g) || [];

const out = {
  dashboard: { url: page.url(), hasAppError: dashboardText.includes('Application error'), hasDashboardZh: dashboardText.includes('仪表盘') },
  tc10_error_zh: { pass: errorText.includes('出错') && (errorText.includes('重试') || errorText.includes('返回')), sample:errorText.slice(0,300) },
  tc11_models_zh: { pass: modelsText.includes('免费') && (modelsText.includes('降级') || modelsText.includes('已降级')), hasFree:modelsText.includes('免费'), hasDegraded:modelsText.includes('降级')||modelsText.includes('已降级') },
  tc12_notification_zh: { pass: relativeMatches.length>0, relativeMatches },
  failedRequests: failed.slice(0,80),
  consoleErrors: consoleErrors.slice(0,40),
};
await fs.writeFile(`${ART}/dynamic-evidence.json`, JSON.stringify(out, null, 2));
await browser.close();
await prisma.$disconnect();
console.log(JSON.stringify(out,null,2));
