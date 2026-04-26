import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE='http://localhost:3099';
const art=process.argv[2];

const loginResp = await fetch(`${BASE}/api/auth/login`, {
  method:'POST',
  headers:{'content-type':'application/json'},
  body: JSON.stringify({email:'admin@aigc-gateway.local', password:'Codex@2026!'})
});
const loginJson = await loginResp.json();
const token = loginJson.token;
if (!token) throw new Error('no token from login api');

const browser = await chromium.launch({ headless:true });
const context = await browser.newContext();
const page = await context.newPage();
const consoleErrors=[];
page.on('console', msg => { if (msg.type()==='error') consoleErrors.push(msg.text()); });

await page.addInitScript((t) => {
  localStorage.setItem('token', t);
  localStorage.setItem('aigc-locale','zh-CN');
}, token);

async function snap(path){ await page.screenshot({path:`${art}/${path}`, fullPage:true}); }

const out={};
await page.goto(`${BASE}/zh/dashboard`, { waitUntil:'domcontentloaded' });
await page.waitForTimeout(1200);
out.dashboardUrl = page.url();
out.dashboardHasAppError = (await page.locator('text=Application error').count())>0;
out.dashboardHasChunkError = (await page.content()).includes('ChunkLoadError');
out.dashboardTextHead = (await page.locator('body').innerText()).slice(0,400);
await snap('dashboard.zh.png');

await page.goto(`${BASE}/zh/error-test`, { waitUntil:'domcontentloaded' });
await page.waitForTimeout(1000);
const bodyError = await page.locator('body').innerText();
out.errorPage={
  url: page.url(),
  hasChineseError: bodyError.includes('出错') || bodyError.includes('重试'),
  hasAppError: bodyError.includes('Application error'),
  textHead: bodyError.slice(0,300)
};
await snap('error-test.zh.png');

await page.goto(`${BASE}/zh/admin/models`, { waitUntil:'domcontentloaded' });
await page.waitForTimeout(1200);
const modelsText = await page.locator('body').innerText();
out.models={
  url: page.url(),
  hasChineseFree: modelsText.includes('免费'),
  hasChineseDegraded: modelsText.includes('降级') || modelsText.includes('已降级'),
  hasAppError: modelsText.includes('Application error'),
  textHead: modelsText.slice(0,300)
};
await snap('admin-models.zh.png');

await page.goto(`${BASE}/zh/dashboard`, { waitUntil:'domcontentloaded' });
await page.waitForTimeout(800);
const notifBtn = page.locator('button[aria-label*="Notifications" i], button[aria-label*="通知" i], button:has-text("notifications")').first();
if (await notifBtn.count()) {
  await notifBtn.click({timeout:3000}).catch(()=>{});
  await page.waitForTimeout(800);
}
const dashText = await page.locator('body').innerText();
out.notification={
  relativeMatches: dashText.match(/(\d+\s*分钟前|\d+分钟前|\d+\s*小时前|\d+小时前|\d+\s*秒前|\d+秒前|刚刚)/g) || []
};
await snap('dashboard-notification.zh.png');

out.consoleErrors=consoleErrors.slice(0,20);

await fs.writeFile(`${art}/dynamic-evidence.json`, JSON.stringify(out,null,2));
await browser.close();
console.log(JSON.stringify(out,null,2));
