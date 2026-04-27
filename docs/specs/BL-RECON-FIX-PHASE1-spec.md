# BL-RECON-FIX-PHASE1 — 对账数据正确性修复 Phase 1

**批次类型：** bugfix（来自 2026-04-27 生产对账数据分析）
**创建：** 2026-04-27
**预计工时：** 0.5 day（A 0.5h + B 0.5h + C 1h audit + 0.5h Codex）
**来源：** 用户 2026-04-27 对账数据分析

---

## 背景

用户要求分析近期对账记录，2026-04-27 SSH 生产 DB 查询发现 6 个 BIG_DIFF：

**Issue 1：Doubao-Seedream-4.5（5 行重复）**
- 04-22/24/25/26/27 五天每天 upstream=3.25 / gateway=0 / delta=-3.25 / -100%
- raw `ExpenseDate=2026-04-02`，全部指同一笔 4-02 的账单
- gateway `call_logs` 无任何 Doubao-Seedream-4.5 记录（用户绕过 gateway 直接用 volcengine console）
- volcengine fetcher 每天把月度账单全量重读 + 写到 reportDate=今日，造成虚假 5 个 BIG_DIFF
- upstream 单位是 CNY（`currency:"CNY"`），但被当 USD 与 gateway USD 直接比较

**Issue 2：openrouter `google/gemini-2.5-flash-image`（1 行）**
- 04-26 upstream=$0.1935 / 5 requests vs gateway=$0.0162 / 6466 tokens → 92% undercount
- channel.costPrice 配置为 `{unit:"token", inputPer1M, outputPer1M}`（按 chat token 计费）
- 但 openrouter 实际按 5 张图 × $0.0387 计费 → 应配置为 `{perCall:0.04}`
- 推断：所有 image-via-chat token-priced 的 channel 都可能存在类似漏算

## Phase 1 目标

**修两个 fetcher / reconcile-job 逻辑 bug + 做一次 image pricing 审计输出报告**：

- **A**：Volcengine fetcher ExpenseDate 过滤（消重复）
- **B**：reconcile-job CNY→USD 货币转换（数据口径正确）
- **C**：Image pricing audit 脚本 + 报告（read-only，不改 DB；用户基于报告决定 Phase 2 是否做配置修复）

**不包含（Phase 2 留观察）：**
- 实际修改 channel.costPrice 配置（需用户基于审计报告决策）
- D 阈值放宽（image 模型 matchDelta=$0.05）

---

## F-RF-01（generator）：Volcengine fetcher ExpenseDate 过滤

### 文件
- `src/lib/billing-audit/fetchers/volcengine.ts`（修改 normalizeBillItem 调用处或 fetchDailyBill 末尾）
- `src/lib/billing-audit/fetchers/__tests__/volcengine.test.ts`（已存在则扩展，否则新建）

### 改动

**fetchDailyBill 返回前，过滤掉 `ExpenseDate ≠ requestedDate` 的行：**

```ts
const targetYmd = formatYMD(date); // YYYY-MM-DD UTC
const list = parsed.Result?.List ?? [];
const filtered = list.filter((item) => {
  const exp = typeof item.ExpenseDate === "string" ? item.ExpenseDate.slice(0, 10) : null;
  return exp === targetYmd;
});
return filtered.map((item) => normalizeBillItem(item, date));
```

**辅助函数 formatYMD**（如已有 formatBillPeriodYYYYMM 类型，复用风格；新增 formatYMD `YYYY-MM-DD` UTC 版本）。

### 单测

- 给定 mock API 返回月度全量（包含 `ExpenseDate=04-02 / 04-15 / 04-23` 三条），`fetchDailyBill(2026-04-23)` 仅返 ExpenseDate=04-23 这一条
- 给定 mock 返回所有行 `ExpenseDate≠target`，返回空数组
- 给定 mock 返回缺失 `ExpenseDate` 字段的行，被过滤（保守）

### Acceptance

- [ ] fetchDailyBill 仅返目标日的账单行
- [ ] 单测覆盖 3 个边界 case
- [ ] tsc + build + vitest 全过

---

## F-RF-02（generator）：reconcile-job CNY→USD 转换

### 文件
- `src/lib/billing-audit/reconcile-job.ts`（在 tier1 path 转换 bill.amount）
- `src/lib/billing-audit/__tests__/reconcile-job.test.ts`（扩展）

### 改动

**reconcile-job tier1 path（约 270 行附近 `for bill of bills` 循环内）：**

```ts
const exchangeRate = await getConfigNumber("EXCHANGE_RATE_CNY_TO_USD", 0.137);
// ...
const upstreamUsd = bill.currency === "CNY" ? bill.amount * exchangeRate : bill.amount;
const delta = gatewaySum - upstreamUsd;
const dp = deltaPercent(upstreamUsd, gatewaySum);
// ...
upsertReconciliation({
  // ...
  upstreamAmount: upstreamUsd,        // 写入 USD-normalized
  details: {
    ...bill.raw,
    currency: bill.currency,           // 保留原始 currency
    upstreamAmountOriginal: bill.amount, // 保留原始数值
    exchangeRateApplied: bill.currency === "CNY" ? exchangeRate : 1,
  },
});
```

**关键点：**
- `EXCHANGE_RATE_CNY_TO_USD` 默认 0.137（已存在 SystemConfig key + .env.example 注释）
- 写入 `upstreamAmount` 字段统一为 USD（与 `gatewayAmount` USD 同口径）
- 原始数值与 currency 保留在 `details` 用于审计追溯

### 单测

- 默认 USD（openrouter / chatanywhere mock fetcher 返回 `currency:"USD"`）→ upstreamAmount 不变
- CNY（volcengine mock fetcher 返回 `currency:"CNY", amount:3.25`）→ upstreamAmount=0.44525（3.25*0.137），details.upstreamAmountOriginal=3.25
- mock SystemConfig EXCHANGE_RATE_CNY_TO_USD=0.14（自定义汇率）→ 转换用此值

### Acceptance

- [ ] tier1 path bill.currency=CNY 时 upstreamAmount 折算为 USD
- [ ] details 保留 `currency` + `upstreamAmountOriginal` + `exchangeRateApplied` 三个新字段
- [ ] 单测覆盖 3 个 case
- [ ] tsc + build + vitest 全过
- [ ] reconcile-job tier 2（balance）path 不动（balance fetcher 有自己的 currency snapshot 逻辑）

---

## F-RF-03（generator）：Image pricing audit 脚本 + 报告

### 文件
- `scripts/audit-image-pricing.ts`（新建）
- `docs/audits/image-pricing-2026-04-27.md`（生成的输出）

### 脚本逻辑

```ts
// 1. 查所有 modality=image 的 model
// 2. 对每个 model，查其所有 channel + costPrice + sellPrice + 关联 provider
// 3. 对每个 token-priced image channel，标注「可疑 — image 模型按 token 计费可能漏算」
// 4. 对最近 30 天 call_logs：取该 model 的 sum(costPrice) / count(*) → avg cost per call
// 5. 输出 markdown 报告
```

### 输出 markdown 结构

```markdown
# Image Pricing Audit（2026-04-27）

## 总计
- image modality models: N
- token-priced channels（可疑）: M
- per-call channels（合理）: K

## 按模型清单

### {modelName}
| provider | costPrice 配置 | 30 天 calls | 30 天 sum(sellPrice) | avg/call |
|---|---|---|---|---|
| openrouter | {unit:"token",input:0.3,output:2.5} | 145 | $2.34 | $0.016 ⚠️ |
| chatanywhere | {perCall:0.04} | 23 | $0.92 | $0.04 ✓ |

⚠️ 标记：token-priced 但 modality=image 的 channel
```

### 运行方式

```bash
# 本地（dev DB 数据少时无意义）：
npx tsx scripts/audit-image-pricing.ts > docs/audits/image-pricing-2026-04-27.md

# 生产只读（推荐，由 admin 在生产 SSH 跑或 codex 用生产 DATABASE_URL）：
DATABASE_URL=postgresql://... npx tsx scripts/audit-image-pricing.ts > docs/audits/image-pricing-2026-04-27.md
```

### Acceptance

- [ ] 脚本能在 prod-readonly DB 上跑通无 error
- [ ] 输出报告含「按模型清单 + ⚠️ 可疑标记 + 30 天数据」
- [ ] 脚本本身不修改任何 DB 数据（read-only 验证）
- [ ] 报告 commit 到仓（用户基于此决定 Phase 2 是否启）
- [ ] tsc + build 通过（脚本编译 OK）

---

## F-RF-04（codex）：验收

### 静态（3）

1. `npx tsc --noEmit` PASS
2. `npm run build` PASS
3. `npx vitest run` PASS（≥ 445 + F-RF-01/02 新增）

### Volcengine fetcher 行为（2）

4. 跑 F-RF-01 单测：mock 月度全量（3 条 ExpenseDate）→ 仅返 target 日
5. 复跑 reconcile（mock fetcher）：reportDate 跨 5 天 → 同一笔 4-02 账单仅在 4-02 那天产生 1 行 BillReconciliation（不再 5 倍重复）

### CNY→USD 转换（2）

6. 跑 F-RF-02 单测 PASS
7. mock fetcher 返 `{currency:"CNY", amount:3.25}` → 写入 BillReconciliation 行 upstreamAmount=0.44525 + details.upstreamAmountOriginal=3.25

### Image pricing audit（2）

8. 运行 `npx tsx scripts/audit-image-pricing.ts` 在测试 DB 上跑通无错（即使无数据也输出空表）
9. 报告输出包含「⚠️ 可疑」标记机制（mock 一个 image modality + token-priced channel 验证标记）

### 报告（1）

10. 写 `docs/test-reports/BL-RECON-FIX-PHASE1-signoff-2026-04-2X.md`，含上述 9 项证据

### 不要求（明确排除）

- ❌ 不要求生产数据上的实际 reconcile 重跑（生产数据由 daily cron 自然修复，逐日积累正确数据）
- ❌ 不要求修复历史已存在的 BIG_DIFF 行（向后修复；老行保留作 audit trail）
- ❌ 不要求任何 channel.costPrice 配置改动（Phase 2 决策后再做）

---

## 非目标 / Phase 2 留观察

| 项 | 留 Phase 2 原因 |
|---|---|
| 实际修改 image channel.costPrice 配置 | 需用户基于 F-RF-03 审计报告决定哪些要从 token-priced 翻成 perCall，且需逐个核对上游真实定价（openrouter activity 单张报价 / 各家图像模型计费规则） |
| 阈值收紧（image matchDelta=$0.05） | image undercount 在 < $0.5 时被分类为 MATCH 隐藏，是 reconcile 阈值粒度问题，需独立讨论 |
| 历史 BIG_DIFF 行的回填 | reconcile-job upsert 是按主键 (providerId, reportDate, modelName) 幂等；生产自然 cron 会逐日修复未来数据，但不会回填历史 |
| user 绕路 volcengine console 监控 | 业务现象不是 bug，但若量级变大可加 admin 告警 |

---

## Risks

| 风险 | 缓解 |
|---|---|
| ExpenseDate 字段 volcengine API 偶发缺失 | 单测覆盖该边界，缺失行 conservatively 过滤掉（不写 reconciliation 行；下次 cron 仍会再尝试） |
| EXCHANGE_RATE_CNY_TO_USD 调整时影响 historical 行 | reconcile-job upsert by 主键，下次 cron 会用新汇率覆盖历史 reportDate 的行（如果 fetcher 仍返该日数据）；现有历史行不动 |
| audit 脚本在生产 SSH 跑时拉大量数据 | 仅查 SUMMARIZE 类（COUNT/SUM/AVG），不全量返回；prod 表当前规模（179 MATCH + 6 BIG_DIFF + 几千 call_logs）影响可忽略 |
| Image audit 报告会触发用户决策延期 | Phase 2 是 deferred 任务，本批次只交付 read-only 报告；不阻塞 Phase 1 done |

## 部署

- F-RF-01 + F-RF-02 改完后下次 cron（次日 04:30 UTC）自动应用新逻辑
- F-RF-03 脚本 + 报告随 commit 入仓，无运行时影响

## 验收标准

- [ ] F-RF-04 的 9 项全 PASS
- [ ] build + tsc + vitest（≥ 445）全过
- [ ] signoff 报告归档
- [ ] 用户 review F-RF-03 报告后决定是否启 Phase 2
