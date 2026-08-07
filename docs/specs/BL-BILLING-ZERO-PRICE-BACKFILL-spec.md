# BL-BILLING-ZERO-PRICE-BACKFILL — 零成本通道定价回填 + gpt-5.5/5.4 卖价补齐

**类型：** 数据修复 + 计费护栏（普通批次，全部 executor:generator）
**创建：** 2026-08-07
**触发：** 用户在 BL-IMG-GUANGTECH-CHANNEL 部署后追问「生产是否还存在因 0 定价导致以后不可用的模型」，只读盘点发现 274 条 ACTIVE 通道 `costPrice` 恒为 0，并发现 `gpt-5.5` 正在完全免费提供。

---

## 1. 现状（2026-08-07 生产只读盘点）

### 1.1 零成本通道

274 条 ACTIVE 通道 `costPrice` 三个字段全为 0（`inputPer1M` / `outputPer1M` / `perCall`），**全部为 TEXT modality**（无 IMAGE，故不涉及 `{unit:'call'}` 换算）：

| provider | 条数 | | provider | 条数 |
|---|---|---|---|---|
| qwen | 187 | | minimax | 5 |
| siliconflow | 62 | | guangtech | 5 |
| zhipu | 6 | | xiaomi-mimo | 2 |
| openrouter | 5 | | deepseek | 2 |

成因：`model-sync.ts` 头注释第 4 条——「全都没有 → costPrice = 0」，即 sync 拿不到官方价时填 0 占位。

### 1.2 只有 45 条真正影响线上

`routeByAlias` 要求 `alias.enabled=true`；BL-SEC-HOTFIX-2608 的 F-SH-03（2026-08-07 部署）移除了 `routeByModelName` 回退。**因此没有启用别名的通道不可路由**，其 costPrice 是死数据，且下次 sync 仍会覆盖。

274 条中挂在启用别名上的为 **45 条**，其余 229 条休眠。

### 1.3 卖价缺失只有两个别名（真实收入泄漏）

全库启用别名中，缺 `sellPrice` 的只有 `gpt-5.5` 与 `gpt-5.4`：

```
gpt-5.5  guangtech/gpt-5.5  ACTIVE  cost {token,0,0}     sell (NULL)
gpt-5.5  openai/gpt-5.5     ACTIVE  cost {token,5,30}    sell (NULL)
gpt-5.4  guangtech/gpt-5.4  ACTIVE  cost {token,0,0}     sell (NULL)
gpt-5.4  openai/gpt-5.4     ACTIVE  cost {token,2.5,15}  sell {token,3,18}
```

- **`gpt-5.5` 恒为免费**：两条通道卖价全空，`calculateTokenCost` 的 `aliasSell` / `channelSell` 都取不到 token 字段 → `sellUsd=0`。历史已漏 106 次调用、上游成本 `$0.957505`。
- **`gpt-5.4` 间歇性免费**：openrouter 路由正常收费，guangtech 路由白送。两条 priority 均为 10，选哪条取决于健康状态与冷却 → 漏费不可预测，报表上极难发现。

其余 43 条线上零成本通道的别名**卖价均正常**，用户一直在正常付费，缺的只是成本记录。

---

## 2. 设计决策（D）

- **D1 价格数据源：** openrouter 公开价目表 `GET https://openrouter.ai/api/v1/models`（无需鉴权，2026-08-07 快照 400 个模型）。`pricing.prompt` / `pricing.completion` 为**每 token USD 字符串**，× 1e6 得 per-1M。快照须落盘存档（`docs/pricing/openrouter-snapshot-<date>.json`）以便复核与复现。

- **D2 costPrice 语义（必须随交付声明）：** openrouter 是**转售平台，其价格含自身渠道费**，而 qwen / siliconflow / deepseek 直连通常更便宜。因此回填出的 costPrice 是**参考值且系统性偏高**，毛利报表会偏悲观。它不改变任何用户扣费，仅影响成本侧与对账。拿到各家真实费率后可逐条覆盖。
  > 这与 `BL-IMG-GUANGTECH-CHANNEL` D3 的性质相同，是同一条口径的延续。

- **D3 匹配规则（防止错配污染成本数据，宁缺毋滥）：**
  1. 归一化：小写；剥离 `:free` / `:beta` / `:extended` / `:thinking` / `:nitro` 等变体后缀；空格与下划线→连字符。
  2. 候选键取自 `channel.realModelId` 与 `model.name`，各自再额外产出：去 vendor 前缀的短名、剥离 `pro/` 前缀后的形式。
  3. 日期后缀归一：`2026-04-20` / `04-20` / `20260420` 三种写法互相尝试。
  4. **精确 id 匹配优先**；短名匹配**要求 openrouter 侧唯一命中**，多于一个候选一律**跳过**并记入报告。
  5. openrouter 侧 `prompt` 与 `completion` 均为 0（`:free` 变体）→ 视为无价，跳过。
  6. 版本号不等的一律不匹配（如本地 `deepseek-v3` 不得匹配 openrouter 的 `deepseek-v3.2`）。
  **任何跳过都必须出现在报告里，不得静默。**

- **D4 加价率（用户裁决）：** `gpt-5.5` / `gpt-5.4` 的别名 `sellPrice` 用 **1.1×**（用户明确选择，低于全局 1.2× 惯例）。
  - `gpt-5.5` → `{token, inputPer1M: 5.5, outputPer1M: 33}`
  - `gpt-5.4` → `{token, inputPer1M: 2.75, outputPer1M: 16.5}`
  - **用户已知悉并接受的后果**：`gpt-5.4` 走 openrouter 通道时现按 1.2×（`{3,18}`）收费，别名层卖价优先级高于通道层，写入 1.1× 后对现有付费用户构成**降价**；`gpt-5.5` 从免费变为收费。
  - 其余 43 条线上通道的别名卖价**一律不动**（本批次不做全局调价）。

- **D5 范围：** 所有 `status='ACTIVE'` 且 costPrice 三字段全零的通道，凡能按 D3 唯一匹配到非零 openrouter 价者皆回填（线上 45 + 休眠约 80）。匹配不上的约 161 条**不猜、不填**，出报告列清单留待另行处理。

- **D6 只写 costPrice：** F-BZP-01 一律不触碰任何 `sellPrice`（避免误改用户账单）。卖价变更集中在 F-BZP-02 的两个别名。

- **D7 幂等 + dry-run + 可回滚：** 默认 dry-run；`--apply` 落库；重复执行结果一致。落库前把每条通道的原 `costPrice` 写入回滚清单（JSON），支持逐条还原。

- **D8 与 sync 的关系：** `model-sync` 对 TEXT 通道会用 `buildCostPrice` 覆盖 `costPrice`。本批次是**一次性数据修复**，若 sync 之后又把它们刷回 0，说明需要在 sync 侧引入 openrouter 价源——**不在本批次范围**，出报告提示即可。

---

## 3. Features

### F-BZP-01 — 零成本通道 costPrice 回填脚本（executor: generator）

新增 `scripts/pricing/backfill-zero-cost-channels.ts`：

- 拉取（或读取已落盘快照）openrouter 价目表，快照存 `docs/pricing/openrouter-snapshot-<date>.json`。
- 按 D3 匹配所有 ACTIVE 零成本通道；输出三段：**将回填**、**跳过（多候选歧义 / 版本不符 / openrouter 无此模型 / openrouter 亦为 0）**、**统计**。
- `--apply` 写入 `costPrice = {unit:'token', inputPer1M, outputPer1M}`（openrouter 价 × 1e6，按 `roundTo6` 取 6 位）。**不得触碰 sellPrice。**
- 落库前生成回滚清单 `docs/pricing/backfill-rollback-<date>.json`（channelId → 原 costPrice）。
- `--only=<channelId,...>` 支持子集执行；CLI 退出前 `prisma.$disconnect()` + `disconnectRedis()`。

**Acceptance：**
1. 默认 dry-run 不写库，打印将回填/跳过的完整清单与统计。
2. 跳过项**逐条给出原因**，无静默丢弃（D3 硬性要求）。
3. `--apply` 后：被回填通道的 `costPrice.unit='token'` 且至少一个价格字段 > 0；**所有 `sellPrice` 与回填前逐字节一致**（须在验收中断言）。
4. 幂等：连跑两次，第二次报告 0 条新回填。
5. 回滚清单文件生成且含每条通道的原值；按清单还原后与回填前状态一致。
6. 版本号不同的模型**不得**互相匹配（如 `deepseek-v3` ↮ `deepseek-v3.2`），须有单测覆盖。
7. 短名多候选时跳过而非任选，须有单测覆盖。
8. `npx tsc --noEmit` + `npm run lint` + `npm run build` + 全量 vitest PASS；独立 commit。

### F-BZP-02 — `gpt-5.5` / `gpt-5.4` 别名卖价补齐（executor: generator）

新增 `scripts/pricing/set-gpt5x-alias-sell-price.ts`（或并入 F-BZP-01 的独立子命令，须与 costPrice 回填分开执行）：

- 按 D4 写入两个别名的 `sellPrice`。
- 同时给 `guangtech/gpt-5.5` 与 `guangtech/gpt-5.4` 两条通道补 `costPrice`（由 F-BZP-01 覆盖，此处仅校验非零）。
- 执行前后各输出一次两个别名的完整定价快照。

**Acceptance：**
1. `gpt-5.5` 别名 `sellPrice = {unit:'token', inputPer1M:5.5, outputPer1M:33}`；`gpt-5.4` = `{unit:'token', inputPer1M:2.75, outputPer1M:16.5}`。
2. 两个别名的 `enabled` 与 `modality` 不被修改。
3. 执行后用 `calculateTokenCost` 的语义验证：给定 1M input + 1M output，`gpt-5.5` 的 `sellUsd` 为 `38.5`、`costUsd` 为 `35`（走 openrouter 通道时）；即卖价确实生效、不再为 0。
4. dry-run / `--apply` / 幂等 / 回滚清单要求同 F-BZP-01。
5. 独立 commit；commit message 须写明 gpt-5.4 对现有用户构成降价、gpt-5.5 由免费转收费。

---

## 4. 影响 / 复用

- **复用：** `scripts/pricing/` 既有脚本范式（`fix-image-channels-2026-04-24.ts` 的口径注释、`fix-or-image-channels-2026-04-25.ts` 的 `SELL_MARKUP` 常量写法）；`src/lib/prisma.ts` 的 `roundTo6`。
- **新增：** 上述两个脚本 + openrouter 快照 + 回滚清单。
- **生产数据变更：** 约 121 条 channel 的 `costPrice`；2 个 alias 的 `sellPrice`。
- **不改代码逻辑**：不动 sync、不动计费公式、不动路由。

## 5. 风险与回滚

| 风险 | 处置 |
|---|---|
| 错配导致成本数据被污染 | D3 的唯一性与版本号约束 + 跳过必报告 + 单测覆盖两类歧义场景 |
| costPrice 系统性偏高 → 毛利偏悲观 | D2 显式声明；不影响用户扣费；拿到真实费率可逐条覆盖 |
| 误改 sellPrice → 用户账单错乱 | F-BZP-01 硬性不触碰 sellPrice，验收断言逐字节一致 |
| `gpt-5.5` 由免费转收费引发用户投诉 | 用户已明确裁决；建议部署前后留意 CallLog 与工单 |
| `gpt-5.4` 降价（1.2× → 1.1×） | 用户已明确知悉并选择 |
| sync 把回填值刷回 0 | D8：本批为一次性修复；若复发则需另立批次给 sync 引入价源 |
| 回滚 | 按回滚清单逐条还原 costPrice / sellPrice；纯数据操作无 schema 变更 |
