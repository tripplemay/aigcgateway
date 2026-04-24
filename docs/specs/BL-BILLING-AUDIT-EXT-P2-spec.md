# BL-BILLING-AUDIT-EXT-P2 Spec

**批次：** BL-BILLING-AUDIT-EXT-P2（Tier 2 余额快照 + 对账 cron + admin 面板 + TTL）
**负责人：** Planner = Kimi / Generator = 默认映射 / Evaluator = Reviewer
**创建：** 2026-04-24
**工时：** 1.5 day
**优先级：** **P1**（P1 批次落地后才启动；依赖 P1 的 Tier 1 fetcher）
**前置：** BL-BILLING-AUDIT-EXT-P1 已 done + 生产稳定 24h

## 背景

P1 批次已完成：
- call_logs 盲区修复（probe / sync / admin_health 全写日志）
- 原 BL-BILLING-AUDIT scope（channelId 错位 / image costPrice / auth_failed 告警 / 错误文本）
- Tier 1 账单 fetcher adapter（Volcengine / OpenRouter / ChatanyWhere）

P2 批次在 P1 基础上补：
- Tier 2 余额快照 fetcher（DeepSeek / SiliconFlow / OpenRouter credits）
- 对账 cron + bill_reconciliation 表
- admin `/admin/reconciliation` 面板（完整版：趋势图 + 表格 + 手动重跑）
- call_logs TTL 30 天 + index

## 目标

1. DeepSeek / SiliconFlow / OpenRouter(credits) 三家每日余额快照
2. 每日 04:30 UTC cron 自动对账 Tier 1 (3 家) + Tier 2 (3 家) 共 6 家
3. admin 面板可视化 30 天对账趋势 + 大差异 channel 钻取
4. call_logs 30 天后自动清理，按 source+date 加 index 优化查询

## 非目标

- 不做 Tier 3 (Zhipu / MiniMax / Qwen / xiaomi-mimo) 上游对账（按决策 D1 直接跳过）
- 不发 email / webhook 告警（按决策 E）
- 不改 P1 已落地的代码路径

## 设计

### F-BAX-08：Tier 2 余额快照 fetcher

**新目录：** `src/lib/billing-audit/fetchers/balance/`

**接口：**
```ts
export interface TierTwoBalanceFetcher {
  readonly providerName: string;
  fetchBalanceSnapshot(): Promise<BalanceSnapshot>;
}
export interface BalanceSnapshot {
  providerId: string;
  snapshotAt: Date;
  currency: 'CNY' | 'USD';
  balance: number;          // 当前余额
  totalUsage?: number;      // lifetime 累计消费（OpenRouter /credits 才有）
  raw: Record<string, unknown>;
}
```

**3 个 fetcher：**

1. **deepseek.ts**: GET `https://api.deepseek.com/user/balance`
   - 返回多币种（CNY + USD 两个 balance_infos）→ 写两条 snapshot
2. **siliconflow.ts**: GET `https://api.siliconflow.cn/v1/user/info`
   - 单一 totalBalance（字符串，可能负数如 `-1.7582`，表示欠费）
3. **openrouter-credits.ts**: GET `https://openrouter.ai/api/v1/credits`
   - 返回 `{total_credits, total_usage}`，snapshot 记 `balance=total_credits - total_usage`, `totalUsage=total_usage`

**新表：**
```prisma
model BalanceSnapshot {
  id          String   @id @default(cuid())
  providerId  String
  provider    Provider @relation(fields: [providerId], references: [id])
  snapshotAt  DateTime @default(now())
  currency    String   // 'CNY' | 'USD'
  balance     Decimal  @db.Decimal(12,4)
  totalUsage  Decimal? @db.Decimal(12,4)
  raw         Json
  createdAt   DateTime @default(now())

  @@index([providerId, snapshotAt])
  @@map("balance_snapshots")
}
```

**Migration：** `20260425_balance_snapshots`

**单测：**
- 每个 fetcher mock HTTP → 返回正确 shape
- 错误场景（401 / 超时）→ 抛 BalanceFetchError

### F-BAX-09：对账 cron + bill_reconciliation 表

**新表：**
```prisma
model BillReconciliation {
  id              String   @id @default(cuid())
  providerId      String
  provider        Provider @relation(fields: [providerId], references: [id])
  reportDate      DateTime @db.Date
  tier            Int       // 1=日级明细 | 2=余额 delta
  modelName       String?   // tier=1 有 per-model; tier=2 NULL
  upstreamAmount  Decimal   @db.Decimal(12,6)
  gatewayAmount   Decimal   @db.Decimal(12,6)
  delta           Decimal   @db.Decimal(12,6)
  deltaPercent    Decimal?  @db.Decimal(6,2)
  status          String    // 'MATCH' | 'MINOR_DIFF' | 'BIG_DIFF'
  details         Json      // 明细 JSON
  computedAt      DateTime  @default(now())

  @@unique([providerId, reportDate, modelName])
  @@index([reportDate])
  @@map("bill_reconciliation")
}
```

**Migration：** `20260425_bill_reconciliation`

**对账 cron：** `src/lib/billing-audit/reconcile-job.ts`
- 在 `src/lib/maintenance/scheduler.ts` 中加一个 timer：每日 04:30 UTC
- leader-lock 同 health scheduler 机制

**对账逻辑：**

```ts
async function runReconciliation(reportDate: Date) {
  const providers = await prisma.provider.findMany({ where: { status: 'ACTIVE' } });
  for (const p of providers) {
    const tier = classifyTier(p.name);  // 1/2/3
    if (tier === 3) continue;  // 跳过

    if (tier === 1) {
      // fetch Tier 1: 获取 upstream per-model bill
      const fetcher = tier1Fetchers[p.name];
      const upstreamBills = await fetcher.fetchDailyBill(reportDate);
      for (const record of upstreamBills) {
        const gatewaySum = await aggregateGatewayCallLogs(p.id, record.modelName, reportDate);
        const delta = record.amount - gatewaySum;
        await writeBillReconciliation({ tier: 1, providerId: p.id, modelName: record.modelName, ... });
      }
    } else if (tier === 2) {
      // fetch Tier 2: 余额 delta
      const fetcher = tier2Fetchers[p.name];
      const snap = await fetcher.fetchBalanceSnapshot();
      await prisma.balanceSnapshot.create({ data: {...snap, providerId: p.id} });
      // delta 对账：取 reportDate 的前日 snapshot vs reportDate snapshot
      const yesterdaySnap = await prisma.balanceSnapshot.findFirst({ where: { providerId: p.id, snapshotAt: {lt: reportDate} }, orderBy: { snapshotAt: 'desc' }});
      if (yesterdaySnap) {
        const upstreamUsage = yesterdaySnap.balance - snap.balance;  // 余额下降 = 消费
        const gatewaySum = await aggregateGatewayCallLogs(p.id, null, reportDate);
        await writeBillReconciliation({ tier: 2, providerId: p.id, modelName: null, upstreamAmount: upstreamUsage, gatewayAmount: gatewaySum, ... });
      }
    }
  }
}

function classifyStatus(delta: number, deltaPercent: number | null): 'MATCH' | 'MINOR_DIFF' | 'BIG_DIFF' {
  if (Math.abs(delta) < 0.5 || (deltaPercent !== null && Math.abs(deltaPercent) < 5)) return 'MATCH';
  if (Math.abs(delta) < 5 && (deltaPercent === null || Math.abs(deltaPercent) < 20)) return 'MINOR_DIFF';
  return 'BIG_DIFF';
}
```

**SystemLog：** 每次 cron 运行后写 1 条 INFO / WARN（BIG_DIFF 数量 > 0 时 WARN）

**注意：** 不发 email / webhook（决策 E）

**单测：**
- mock fetchers → reconcile-job 写 bill_reconciliation 行
- tier 1/2/3 分类正确
- status 分类边界 case（delta=0.5 刚好到 MATCH / MINOR 边界）

### F-BAX-10：admin /admin/reconciliation 面板

**前端：** `src/app/(console)/admin/reconciliation/page.tsx`

**布局：**
1. **Provider summary cards**（顶部，横向 6 个卡片，per-provider）：
   - 今日 diff / 本周 diff / 本月 diff
   - Gateway amount / Upstream amount / delta / status
   - 绿色 MATCH / 黄色 MINOR_DIFF / 红色 BIG_DIFF
2. **30 天趋势图**（recharts 折线图）：
   - Y 轴：delta 金额
   - X 轴：日期
   - 按 provider 分线（过滤控件）
3. **BIG_DIFF 明细表**：
   - 列：Date / Provider / Model / Upstream / Gateway / Delta / Status / Details（钻取）
   - 每行点击 → 展开 JSON details
   - 过滤：date range / provider / status
4. **手动重跑按钮**：
   - 选 date + provider → POST `/api/admin/reconciliation/rerun`
   - 后端立即触发 reconcile-job(reportDate, providerId) 同步执行并返回结果

**API：**
- `GET /api/admin/reconciliation?start=YYYY-MM-DD&end=YYYY-MM-DD&providerId=xxx&status=BIG_DIFF`
- `POST /api/admin/reconciliation/rerun` body `{date, providerId}`
- `GET /api/admin/reconciliation/balance-snapshots?providerId=xxx&days=30`（面板侧显示余额趋势）

**i18n：** 中英双语文案（走 next-intl messages/admin.json）

**单测：**
- E2E（Playwright 可选）：面板加载 + 手动重跑按钮点击 → mock cron 返回数据
- API 单测：分页 / 过滤 / 手动重跑

### F-BAX-11：call_logs TTL 30 天 + index

**文件：**
- `src/lib/maintenance/archive-cleanup.ts` 扩展
- migration `20260425_call_logs_indexes`

**TTL 逻辑：**
```ts
// 在 archive-cleanup.ts 里
const CALL_LOGS_TTL_DAYS = 30;
async function cleanupCallLogs() {
  const cutoff = new Date(Date.now() - CALL_LOGS_TTL_DAYS * 24 * 60 * 60 * 1000);
  const result = await prisma.callLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
  console.log(`[maintenance] call_logs cleanup: deleted ${result.count} rows older than ${cutoff.toISOString()}`);
}
```

**index migration：**
```sql
-- P1 已加 source 字段，这里补 index
CREATE INDEX IF NOT EXISTS idx_call_logs_source_date ON call_logs(source, "createdAt");
CREATE INDEX IF NOT EXISTS idx_call_logs_channel_source_date ON call_logs("channelId", source, "createdAt");
-- 对账查询优化：GROUP BY provider+model for a date range
CREATE INDEX IF NOT EXISTS idx_call_logs_created_at ON call_logs("createdAt");
```

**单测：**
- 插入 50 条旧 call_log（> 30 天）+ 50 条新 → 运行 cleanupCallLogs → 剩 50 条新的
- tsc + build 通过

### F-BAX-12：Codex 全量验收

**构建与单测（4 项）：**
1. `npm run build` 通过
2. `npx tsc --noEmit` 通过
3. `npx vitest run` 全过（新单测 PASS + P1 + 旧单测不破坏）
4. Prisma migrations 生产 equivalent 执行通过

**功能验证（6 项）：**
5. 手动触发 `/api/admin/reconciliation/rerun` 对 2026-04-22 + volcengine → bill_reconciliation 表新增行，status 有分类
6. OpenRouter fetcher 拉 2026-04-22 activity → bill_reconciliation 记录 per-model 行
7. ChatanyWhere fetcher 拉 → bill_reconciliation 记录（即使 empty）
8. DeepSeek fetcher 拉余额 → balance_snapshots 表新增 2 行（CNY + USD）
9. 2 天后运行 → tier 2 delta 对账生效（yesterday vs today）
10. `/admin/reconciliation` 面板 load 正常，30 天趋势图有数据，手动重跑按钮工作

**生产观察（4 项，部署后 48h）：**
11. 每日 04:30 UTC cron 自动执行，bill_reconciliation 每日新增 6-10 行（tier1 per-model + tier2 per-provider）
12. SystemLog 有对应 BILLING_AUDIT INFO/WARN 记录
13. call_logs TTL 生效：生产 30 天前记录被清理（查 `MIN(createdAt)` 应接近今天-30 天）
14. admin 面板 BIG_DIFF 条目 < 30%（健康水位；极端情况警戒）

**15. 生成 signoff 报告 `docs/test-reports/BL-BILLING-AUDIT-EXT-P2-signoff-2026-04-2X.md`。**

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| admin 面板前端工作量大（recharts 图 + filter + dialog） | 复用 BL-FE-PERF-01 的 dynamic import 模式；必要时简化趋势图，先出表格 |
| BalanceSnapshot 表易膨胀（10 providers × 2 currencies × 1/天） | 无膨胀担忧：365 天 × 20 行 = 7300 行/年，正常 |
| bill_reconciliation 表 | unique(providerId, reportDate, modelName) 防重；同一天重跑 upsert |
| Tier 2 余额 delta 首日无前日 snapshot | 首日跳过 delta 计算；从第二天开始对账 |

## 部署

- 需 Prisma migrations：`npx prisma migrate deploy`
- 部署：git pull + npm ci + npx prisma migrate deploy + npm run build + pm2 restart
- reconcile-job 通过 maintenance-scheduler 自动启动

## 验收标准

- [ ] F-BAX-12 的 15 项全过（生产观察可在部署后 48h 内补）
- [ ] build + tsc + vitest 全过
- [ ] signoff 报告归档
