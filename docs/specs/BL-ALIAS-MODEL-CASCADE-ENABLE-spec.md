# BL-ALIAS-MODEL-CASCADE-ENABLE 规格文档

**批次 ID：** BL-ALIAS-MODEL-CASCADE-ENABLE  
**创建日期：** 2026-05-01  
**状态：** building  
**优先级：** high

---

## 背景与目标

Admin 在控制台启用 alias 后，用户面（`GET /v1/models`）仍无法看到该 alias——原因是 alias 关联的 model 未同步置为 `enabled=true`。此外，alias 列表页缺乏 health-FAIL 可见性和 sellPrice 缺失预警，导致 alias 看起来正常但实际不可用。

本批次修复三个连锁 Bug：
- **Bug-A**：PATCH alias enabled=true 未级联 model.enabled=true
- **Bug-B**：alias 列表 UI 无法看到 sellPrice 是否缺失
- **Bug-C**：alias 列表 UI 无法看到 channel 全部 FAIL
- **Bug-D**（关联 BL-HEALTH-PROBE-MIN-TOKENS）：health-FAIL 的 alias 被静默隐藏

---

## F-ACE-01：后端级联启用

**优先级：** high  
**executor：** generator

### 需求描述

当管理员通过 `PATCH /api/admin/model-aliases/:id { enabled: true }` 启用一个 alias 时，若该 alias 关联的 model 当前 `enabled=false`，后端应自动将其 model 一并置为 `enabled=true`，使 alias 在用户面立即可见。

### 实现要点

- 修改位置：alias PATCH route（`src/app/api/admin/model-aliases/[id]/route.ts`）
- 仅在请求体包含 `enabled: true` 且当前 alias `enabled=false`（即发生 false→true 翻转）时触发级联
- 用 Prisma transaction 保证原子性：alias.enabled + model.enabled 同步更新
- dev 环境无 Redis cache，`GET /v1/models` 立即反映变更（无需额外 cache invalidation）

### 验收条件

1. `PATCH /api/admin/model-aliases/:id { enabled: true }`（当前 enabled=false），linked model 有 enabled=false → 响应后 `GET /api/admin/model-aliases` 验证 `linkedModels[].modelEnabled=true`
2. dev env（无 Redis cache）`GET /v1/models` 立即返回该 alias
3. `PATCH` 只改其他字段（如 brand）→ linked model.enabled 不变（不触发级联）
4. `npx tsc --noEmit` PASS
5. `npm run build` PASS

---

## F-ACE-02：列表 API 暴露 modelEnabled + lastHealthResult

**优先级：** high  
**executor：** generator

### 需求描述

`GET /api/admin/model-aliases` 的响应中，每条 alias 的 `linkedModels` 数组需补充两个字段：
- `modelEnabled: boolean` — 对应 `model.enabled`
- `lastHealthResult: 'PASS' | 'FAIL' | null` — 对应该 channel 最新一条 healthCheck 的 result（无记录时为 null）

这两个字段是 F-ACE-03 UI 徽章的数据基础。

### 实现要点

- 修改位置：alias 列表 GET route 的 Prisma query（`src/app/api/admin/model-aliases/route.ts`）
- `linkedModels` join `model`（取 `enabled`）+ join `channels`（取最新 `healthChecks` 的 `result`）
- TypeScript 类型同步更新（route 返回类型 + page.tsx 使用类型）

### 验收条件

1. `GET /api/admin/model-aliases` 每条 alias 的 `linkedModels[n].modelEnabled` 为 `boolean`
2. `linkedModels[n].channels[m].lastHealthResult` 为 `'PASS'|'FAIL'|null`（无记录为 null）
3. page.tsx 的 LinkedModel / channel 类型同步更新，`npx tsc --noEmit` PASS
4. 现有字段（latencyMs / providerName 等）不变

---

## F-ACE-03：Admin UI 链路状态徽章 + 启用预警 toast

**优先级：** high  
**executor：** generator

### 需求描述

在 alias 列表页面增加两类状态徽章，并在 toggle false→true 时根据链路健康情况弹出预警 toast。

### 徽章规则

| 条件 | 徽章 | 颜色 |
|---|---|---|
| enabled alias 的所有 channel lastHealthResult=FAIL | '渠道全部异常' / 'All channels failing' | 红色 |
| enabled alias 的 sellPrice=null 或 {} | '价格未设置' / 'Price not set' | 黄色 |
| 有 sellPrice + 有非 FAIL channel | 无徽章 | — |

### Toast 预警规则（toggle false→true 时）

- sellPrice 未设置 → toast 含价格警告
- 所有 channel FAIL → toast 含不可见警告
- 两者均满足 → 两条警告合并展示

### i18n

`en.json` 和 `zh-CN.json` 各新增 5 个 key：

| Key | 中文 | English |
|---|---|---|
| `chainStatusWarnNoSellPrice` | 价格未设置 | Price not set |
| `chainStatusWarnAllFail` | 渠道全部异常 | All channels failing |
| `chainStatusWarnNoChannel` | 无可用渠道 | No available channels |
| `toastEnabledNoSellPrice` | 已启用，但 sell price 未配置，用户面看不到价格 | Enabled, but sell price is not set — users won't see a price |
| `toastEnabledAllFail` | 已启用，但所有渠道健康检查失败，用户面请求将失败 | Enabled, but all channels are failing health checks — requests will fail |

### 验收条件

1. alias 列表中，所有 channel lastHealthResult=FAIL 的 enabled alias → 红色'渠道全部异常'徽章（中/英）
2. sellPrice=null 或 {} 的 enabled alias → 黄色'价格未设置'徽章
3. toggle false→true 时，sellPrice 未设置 → toast 含价格警告；所有 channel FAIL → toast 含不可见警告
4. 健康链路 alias（有 sellPrice + 有非 FAIL channel）→ 无警告徽章
5. en.json + zh-CN.json 各新增 5 个 key
6. `npx tsc --noEmit` PASS
7. `npm run build` PASS

---

## 执行顺序

F-ACE-01 → F-ACE-02 → F-ACE-03（串行，后者依赖前者的 API 字段）

## 风险提示

- F-ACE-01 的级联逻辑需要确认：alias 可能关联多个 model（M:N），需批量 update 所有关联 model
- F-ACE-02 的 healthChecks 查询需注意 N+1，建议用 Prisma `include` 嵌套取最新一条
- F-ACE-03 toggle 预警仅在 false→true 时触发，不影响已 enabled 状态的刷新

## 关联 backlog

- **BL-HEALTH-PROBE-MIN-TOKENS**（medium，独立批次）— 修复 probe max_tokens=1 与 Azure-backed model 不兼容，解决 Bug-D（gpt-5 alias 永远 FAIL 被隐藏）
