# BL-RECON-UX-PHASE1 — 对账面板 UX Phase 1（A+D+E + 倒序）

**批次类型：** 功能优化（Phase 1，前后端 + i18n）
**创建：** 2026-04-27
**预计工时：** 1.25 day（0.5d 后端 + 0.5d 前端 + 0.25d Codex 验收）
**来源：** 用户 2026-04-27 对话需求 — 优化 `/admin/reconciliation` 页面

---

## 背景

`/admin/reconciliation` 当前现状：

- 366 行 client component，4 区块：provider summary cards / 30 天趋势折线 / 手动重跑 / BIG_DIFF 明细表
- API 默认拉最近 30 天（不可调）；`orderBy: { reportDate: "asc" }` 导致**最新数据排在底部**
- 明细表全量渲染（无分页），数据多了表会卡
- Tier 维度（1/2/3）不可筛选，无法专注 per-tier 异常
- model 列无搜索，只能眼力扫
- 无 CSV 导出，财务月底人工抄数字
- 阈值（MATCH `|Δ|<0.5 或 |%|<5` / MINOR `|Δ|<5 且 |%|<20`）硬编码在 `src/lib/billing-audit/reconcile-job.ts:78-81`，调一次要改代码 + 重部署

本批次目标：**A 视图/筛选 + D CSV 导出 + E 阈值可配置 + 排序倒序（最新在顶）**，分 3 个 features。
**不包含：** 告警闭环（C，留 Phase 2）/ 数据洞察（B，留 Phase 2）/ 重跑 audit trail（F）/ Tier 3 透明度（G）。

---

## F-RC-01（generator）：后端 — API 增强 + reconcile-job 阈值化 + CSV 导出 + SystemConfig

### F-RC-01a：列表 API 增强（`src/app/api/admin/reconciliation/route.ts`）

**新增 query 参数：**

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `start` | YYYY-MM-DD | 30 天前 | 已有 |
| `end` | YYYY-MM-DD | 今日 | 已有 |
| `providerId` | string | – | 已有 |
| `status` | enum | – | 已有：MATCH/MINOR_DIFF/BIG_DIFF |
| `tier` | int 1\|2 | – | **新增**：仅返回该 tier；不传 = 全部（Tier 3 在面板不展示） |
| `modelSearch` | string | – | **新增**：模型名 contains（大小写不敏感） |
| `page` | int ≥1 | 1 | **新增** |
| `pageSize` | int 1-200 | 50 | **新增**，max 200 |
| `sort` | "asc"\|"desc" | **"desc"** | **新增**：默认倒序（最新在顶，**用户明确要求**） |

**返回结构变化：**
```ts
// 旧
{ data: ReconRow[] }
// 新
{
  data: ReconRow[],
  meta: { total: number, page: number, pageSize: number }
}
```

**实现要点：**
- `tier` filter 通过 join 后 provider name 做（reconcile-job 已有 `TIER_1_NAMES` / `TIER_2_NAMES` set，可在 API 内用同样逻辑）。简洁做法：API 顶部 import `getProviderTier` from reconcile-job，先查 providers + 算 tier，再做 where filter（或纯 SQL by provider.name in (...)）
- `modelSearch` 用 `modelName: { contains: query, mode: 'insensitive' }`
- pagination：`skip = (page-1)*pageSize`, `take = pageSize`
- `prisma.billReconciliation.count({ where })` 与 findMany 并发
- sort：`orderBy: [{ reportDate: sort }, { computedAt: sort }]`，确保同日多行也稳定排序

### F-RC-01b：CSV 导出 API（**新建** `src/app/api/admin/reconciliation/export/route.ts`）

```
GET /api/admin/reconciliation/export?<同列表 API 全部 filter，无 page/pageSize>
→ Content-Type: text/csv; charset=utf-8
→ Content-Disposition: attachment; filename="reconciliation-YYYY-MM-DD.csv"
```

**实现要点：**
- 复用列表 API 的 where 构造逻辑（建议抽 helper `buildReconWhere(query)` 在两处共用）
- **不分页**，但加 hard cap：`take: 10000`（防止误导出全量）；超 cap 时返回 400 + `message: "row count exceeds 10000, narrow filter"`
- CSV 字段顺序：`reportDate,tier,providerName,modelName,upstreamAmount,gatewayAmount,delta,deltaPercent,status,computedAt`
- 数值列保留 6 位小数（与 schema Decimal(12,6) 对齐）
- header 用英文（财务工具兼容）；中文 admin 也可接受
- BOM 前缀 `﻿` 让 Excel 正确识别 UTF-8

### F-RC-01c：reconcile-job 阈值化（`src/lib/billing-audit/reconcile-job.ts`）

**改造 `classifyStatus`：**

```ts
export interface ReconThresholds {
  matchDeltaUsd: number;     // 默认 0.5
  matchPercent: number;      // 默认 5
  minorDeltaUsd: number;     // 默认 5
  minorPercent: number;      // 默认 20
}

export const DEFAULT_THRESHOLDS: ReconThresholds = {
  matchDeltaUsd: 0.5, matchPercent: 5,
  minorDeltaUsd: 5,   minorPercent: 20,
};

export function classifyStatus(
  delta: number,
  deltaPercent: number | null,
  thresholds: ReconThresholds = DEFAULT_THRESHOLDS,
): "MATCH" | "MINOR_DIFF" | "BIG_DIFF" {
  const ad = Math.abs(delta);
  const ap = deltaPercent === null ? null : Math.abs(deltaPercent);
  if (ad < thresholds.matchDeltaUsd) return "MATCH";
  if (ap !== null && ap < thresholds.matchPercent) return "MATCH";
  if (ad < thresholds.minorDeltaUsd && (ap === null || ap < thresholds.minorPercent)) return "MINOR_DIFF";
  return "BIG_DIFF";
}
```

**新增 helper `loadThresholds()`：**

```ts
import { getConfigNumber } from "@/lib/config";
export async function loadThresholds(): Promise<ReconThresholds> {
  return {
    matchDeltaUsd: await getConfigNumber("RECONCILIATION_MATCH_DELTA_USD", 0.5),
    matchPercent:  await getConfigNumber("RECONCILIATION_MATCH_PERCENT", 5),
    minorDeltaUsd: await getConfigNumber("RECONCILIATION_MINOR_DELTA_USD", 5),
    minorPercent:  await getConfigNumber("RECONCILIATION_MINOR_PERCENT", 20),
  };
}
```

**`runReconciliation` 入口改造：**
- 函数顶部 `const thresholds = await loadThresholds()`
- Tier 1 / Tier 2 处理流程内调用 `classifyStatus(delta, dp, thresholds)`（替换 2 处现有 `classifyStatus(delta, dp)` 调用）

### F-RC-01d：SystemConfig keys 注入（默认值，幂等）

在 `prisma/seed.ts` 或新增 `scripts/seed-recon-config.ts`：

```ts
const recoKeys = [
  ["RECONCILIATION_MATCH_DELTA_USD", "0.5", "对账 MATCH 判定：|delta|（USD）<此值视为匹配"],
  ["RECONCILIATION_MATCH_PERCENT",   "5",   "对账 MATCH 判定：|百分比| <此值视为匹配"],
  ["RECONCILIATION_MINOR_DELTA_USD", "5",   "对账 MINOR_DIFF 判定：|delta|（USD）<此值视为小差异"],
  ["RECONCILIATION_MINOR_PERCENT",   "20",  "对账 MINOR_DIFF 判定：|百分比| <此值视为小差异"],
];
for (const [k, v, d] of recoKeys) {
  await prisma.systemConfig.upsert({ where: { key: k }, update: {}, create: { key: k, value: v, description: d } });
}
```

**注意：** seed `update: {}` 表示已存在不覆盖；只在首次创建时填默认值（管理员后续从 UI 改）。

### F-RC-01 单测

- `src/app/api/admin/reconciliation/__tests__/route.test.ts`（已存在，扩展）：
  - `pageSize=5 page=2` 返回正确切片
  - `sort=desc` 默认 + `sort=asc` 显式都生效
  - `tier=1` 仅返 Tier 1 provider 记录
  - `modelSearch=gpt` 大小写不敏感命中
  - `meta.total` 与 actual records 一致
- `src/app/api/admin/reconciliation/export/__tests__/route.test.ts`（**新建**）：
  - 返回 200 + `text/csv` + 正确 BOM + header
  - hard cap 10000 触发 400
  - 列顺序 + 数值精度 + `attachment;filename=...` header
- `src/lib/billing-audit/__tests__/reconcile-job.test.ts`（已存在，扩展）：
  - `classifyStatus` 接受 thresholds 参数后行为：
    - 默认参数 → 与旧版本一致（回归保护）
    - 自定义阈值 `{matchDeltaUsd: 0.1}` → 0.3 不再 MATCH 而是 MINOR_DIFF（边界变化）

### F-RC-01 acceptance

- [ ] API 列表新增 4 个 query 参数（tier/modelSearch/page/pageSize）+ sort 默认 desc + meta.total 返回
- [ ] CSV 导出 API（带 BOM + Content-Disposition + 10000 hard cap）
- [ ] reconcile-job classifyStatus 接受 thresholds + loadThresholds + runReconciliation 自动加载
- [ ] SystemConfig 4 keys 在 seed 中幂等注入
- [ ] 单测全过 + 现有 vitest 不回退（414+）
- [ ] tsc + build 通过

---

## F-RC-02（generator）：前端 — 排序/分页/筛选/搜索/导出/阈值 UI

**文件：** `src/app/(console)/admin/reconciliation/page.tsx`（366 → 预计 ~480 行）+ `messages/{en,zh-CN}.json`

### 视图改造

| 区块 | 改造 |
|---|---|
| Provider summary cards | 不变 |
| 30 天趋势折线 | 不变（默认仍 30 天聚合） |
| **手动重跑** | 不变（已有日期 + provider 输入） |
| **阈值配置（新区块）** | 4 个 input（match Δ/match % / minor Δ / minor %）+ 保存按钮，调 PUT `/api/admin/config`；保存后 toast 提示「下次重跑生效」 |
| BIG_DIFF 明细表 | 见下文「明细表改造」 |

### 明细表改造

- **日期范围 picker**：start/end 两个 `<input type="date">`，默认 today-30 / today；改后触发 refetch
- **倒序默认**：state `sortDir: "desc" \| "asc"`，默认 desc；表头加点击排序图标（仅 reportDate 列），点击切 asc/desc
- **per-tier 切换**：button group `[All | Tier 1 | Tier 2]`，默认 All（注意：Tier 3 不展示因为 reconcile-job 本就不写 Tier 3 行）
- **分页**：底部 Pagination component（reuse 项目现有组件，如有；否则新增 `<PaginationBar page totalPages onChange />`），默认 pageSize=50；选项 `[20, 50, 100, 200]`
- **model search**：现有 providerId 输入框旁增加 model search input，debounce 300ms
- **导出 CSV 按钮**：表头右上角，调用 `/api/admin/reconciliation/export?<当前 filter>` 触发浏览器下载
- 行展开 details JSON 不变

### i18n 新增 keys（`messages/{en,zh-CN}.json`）

```json
"adminReconciliation": {
  "dateRangeStart": "起始日期 / Start date",
  "dateRangeEnd":   "结束日期 / End date",
  "tierAll":        "全部 / All",
  "tierOne":        "Tier 1",
  "tierTwo":        "Tier 2",
  "modelSearchPlaceholder": "搜索模型 / Search model",
  "pageSize":       "每页 / Per page",
  "exportCsv":      "导出 CSV / Export CSV",
  "exportTooLarge": "结果超过 10000 行，请缩小筛选范围 / Result exceeds 10000 rows, narrow filter",
  "thresholdsTitle":"阈值配置 / Thresholds",
  "thresholdsDesc": "下次重跑生效 / Effective on next reconciliation run",
  "thMatchDelta":   "MATCH |Δ|<",
  "thMatchPercent": "MATCH |%|<",
  "thMinorDelta":   "MINOR |Δ|<",
  "thMinorPercent": "MINOR |%|<",
  "thresholdSaved": "已保存 / Saved",
  "sortAsc":        "升序 / Ascending",
  "sortDesc":       "降序 / Descending"
}
```

### F-RC-02 acceptance

- [ ] 列表默认显示**最新数据在顶部**（API sort=desc 默认）
- [ ] 日期范围 picker 改 → 列表实时刷新
- [ ] 表头 reportDate 列点击可切排序方向
- [ ] Tier 按钮组切换正常（All/1/2）
- [ ] 分页正常（前后 + pageSize 切换）
- [ ] 模型搜索 debounce 300ms 后请求
- [ ] 导出 CSV 按钮触发下载，> 10000 行时 toast 错误提示
- [ ] 阈值配置区块 4 个 input + 保存 → 调 PUT /api/admin/config × 4（顺序）→ toast 成功
- [ ] 中英文切换均正常显示
- [ ] tsc + build 通过

---

## F-RC-03（codex）：全量验收

### 静态（3）

1. `npx tsc --noEmit` PASS
2. `npm run build` PASS
3. `npx vitest run` PASS（≥ 414 + F-RC-01 新增单测，无失败）

### API 行为（6）

4. `GET /api/admin/reconciliation` 默认 `sort=desc`，第一行 `reportDate` ≥ 第二行
5. `GET /api/admin/reconciliation?sort=asc&page=1&pageSize=5` 返回 5 行 + `meta.total > 5`
6. `GET /api/admin/reconciliation?tier=1` 仅返 Tier 1 provider 行（手动核对 provider name in {volcengine, openrouter, openai}）
7. `GET /api/admin/reconciliation?modelSearch=gpt` 大小写不敏感命中
8. `GET /api/admin/reconciliation/export?status=BIG_DIFF` 返 `text/csv` + 含 BOM + header 第一行符合
9. 触发 hard cap：构造能命中 > 10000 行的 query → 400 + 错误 message

### 前端冒烟（5）

10. 登录 admin → `/admin/reconciliation` → 列表第一行是最近一天的数据（不是 30 天前）
11. 改 date picker 至最近 7 天 → refetch；表行数减少
12. 切 Tier 1 → 仅显示 Tier 1 provider 行
13. 阈值改 `MATCH |Δ|<` 至 `0.1` → 保存（toast 显示）→ 手动重跑昨日 → 部分原 MATCH 行变 MINOR_DIFF（重跑后 refetch 看到状态变化）
14. 点击导出 CSV → 浏览器下载文件 → Excel 打开列正确

### 国际化（1）

15. 切 zh-CN → 列表表头 / 阈值区块标签全部显示中文

### 报告（1）

16. 写 `docs/test-reports/BL-RECON-UX-PHASE1-signoff-2026-04-2X.md`，含上述 15 项证据 + 关键截图（默认列表 / Tier 切换 / 阈值改后结果 / CSV 文件预览）

---

## 非目标（明确排除）

- **不动 reconcile-job 核心算法**（仅改阈值读取来源）
- **不改 cron 调度**（每日 04:30 UTC 不变）
- **不改 BillReconciliation 表 schema**
- **不引入告警通道（Phase 2 C 类）**：BIG_DIFF 仍只 SystemLog WARN
- **不加重跑 audit trail（Phase 2 F）**
- **不展示 Tier 3 占位（Phase 2 G）**
- **趋势图样式不动**（Phase 2 视情况加阈值线）
- **不改 balance-snapshots API**（与本批次无关）

---

## Risks

| 风险 | 缓解 |
|---|---|
| 阈值改太松 → 漏掉真问题 | 阈值修改不溯及历史行（不重算 history）；只下次 cron / 手动重跑生效；UI 提示 |
| 大量数据导出卡浏览器 | 10000 行 hard cap + 服务端流式可选（本批次不做流式，cap 足够） |
| pagination 改动后 buildCards/buildTrend 计算口径变 | summary cards / 趋势图仍基于"当前页 + 全 30 天"两套数据源不混；建议 cards/trend 单独走一个 `?aggregate=true` 不分页接口 → **简化方案**：cards/trend 仍拿当前页 rows 但 fetch 改 `pageSize=200` 限制（妥协，下文记） |
| 中文 i18n 文案过长撑破布局 | 阈值区块用 grid 自适应 |

**关于 cards/trend 数据源：** 本批次为简化起见，summary cards 和趋势图仍用列表 API 数据，但 fetch 时**额外发一个 `?pageSize=200&page=1`** 拉前 200 条作为聚合源（默认 30 天 × ~10 provider 一般 < 200 行），明细表用独立的分页 API 调用。两路并行，meta 各算各。如果未来对账数据爆增 > 200 行/30 天，再拆 `aggregate` 接口。

---

## 部署

- 后端 API 改 + reconcile-job 阈值化 + SystemConfig seed 新 keys
- 前端 page 改 + i18n
- 部署：`git pull + npm ci + npm run build + npx prisma db seed + pm2 restart`
- 回滚：revert commit + DELETE FROM system_configs WHERE key LIKE 'RECONCILIATION_%'（可选，留着也无影响）
