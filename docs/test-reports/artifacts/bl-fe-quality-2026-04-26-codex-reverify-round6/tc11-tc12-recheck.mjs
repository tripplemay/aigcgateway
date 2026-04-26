import fs from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { chromium } from 'playwright';

const BASE='http://localhost:3099';
const ART=process.argv[2];
const prisma = new PrismaClient();

const loginResp = await fetch(`${BASE}/api/auth/login`, {
  method:'POST', headers:{'content-type':'application/json'},
  body: JSON.stringify({email:'admin@aigc-gateway.local', password:'Codex@2026!'})
});
const login = await loginResp.json();
if (!login?.user?.id) throw new Error('login user missing');
const loginUserId = login.user.id;

await prisma.notification.deleteMany({ where:{ userId: loginUserId } });
const now = Date.now();
await prisma.notification.createMany({ data:[
  { userId:loginUserId, eventType:'BALANCE_LOW', channel:'INAPP', status:'SENT', payload:{currentBalance:1.23, threshold:5}, createdAt:new Date(now-5*60*1000), sentAt:new Date(now-5*60*1000) },
  { userId:loginUserId, eventType:'CHANNEL_DOWN', channel:'INAPP', status:'SENT', payload:{providerName:'MiniMax', modelName:'abab5.5-chat'}, createdAt:new Date(now-2*60*60*1000), sentAt:new Date(now-2*60*60*1000) }
]});

await prisma.channel.updateMany({ where:{ status:{ in:['ACTIVE','DISABLED'] } }, data:{ status:'DEGRADED' } });
const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379/0');
const keys = await redis.keys('cache:admin:channels*');
if (keys.length) await redis.del(...keys);
await redis.quit();

const browser = await chromium.launch({ headless:true });
const context = await browser.newContext();
const page = await context.newPage();

await page.goto(`${BASE}/login`, { waitUntil:'domcontentloaded' });
await page.fill('input[type="email"], input[name="email"]', 'admin@aigc-gateway.local');
await page.fill('input[type="password"], input[name="password"]', 'Codex@2026!');
await page.keyboard.press('Enter');
await page.waitForURL('**/dashboard', { timeout: 15000 });
await page.evaluate(() => localStorage.setItem('aigc-locale','zh-CN'));
await page.reload({ waitUntil:'networkidle' });

await page.goto(`${BASE}/admin/models`, { waitUntil:'networkidle' });
await page.waitForTimeout(1500);
const modelsText = await page.locator('body').innerText();
await page.screenshot({ path:`${ART}/admin-models.zhCN.recheck.png`, fullPage:true });

await page.goto(`${BASE}/dashboard`, { waitUntil:'networkidle' });
await page.waitForTimeout(800);
const clicked = await page.evaluate(() => {
  const btns=[...document.querySelectorAll('button')];
  const b=btns.find((x)=>/notification|通知/i.test((x.getAttribute('aria-label')||'')+' '+(x.textContent||'')) || x.querySelector('.material-symbols-outlined')?.textContent?.includes('notifications'));
  if (b) { b.click(); return true; }
  return false;
});
if (clicked) await page.waitForTimeout(1000);
const notifText = await page.locator('body').innerText();
await page.screenshot({ path:`${ART}/dashboard-notification.zhCN.recheck.png`, fullPage:true });

const relativeMatches = notifText.match(/(\d+\s*分钟前|\d+分钟前|\d+\s*小时前|\d+小时前|\d+\s*秒前|\d+秒前|刚刚)/g) || [];

const out={
  loginUserId,
  tc11:{ pass: modelsText.includes('免费') && modelsText.includes('降级'), hasFree:modelsText.includes('免费'), hasDegraded:modelsText.includes('降级') },
  tc12:{ pass: relativeMatches.length>0, relativeMatches },
  modelsHits: modelsText.split('\n').filter(Boolean).filter(l=>/降级|免费|L1|健康|Degraded|Free/i.test(l)).slice(0,40),
  notifSample: notifText.slice(0,800)
};
await fs.writeFile(`${ART}/tc11-tc12-recheck.json`, JSON.stringify(out,null,2));
await browser.close();
await prisma.$disconnect();
console.log(JSON.stringify(out,null,2));
