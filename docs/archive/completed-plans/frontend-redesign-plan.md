# 前端重构计划书 — Algorithmic Atelier 设计系统全站落地

## 背景

AIGC Gateway 控制台此前完成了框架层（Layout Shell、Sidebar、Top Bar）和两个核心页面（API Keys、Channel Management）的 Stitch 原型 1:1 重构。本次计划将设计系统扩展到剩余所有页面。

## 原则

1. **1:1 按 Stitch 原型 HTML 还原**：JSX 结构、class name、嵌套层级严格对照 `design-draft/` 下的 `code.html`
2. **仅换皮，不改功能**：保留每个页面现有的全部数据获取逻辑（state、useEffect、API 调用），只替换 return 中的 JSX 部分
3. **不增不减**：不新增功能、不移除功能、不改 API、不改数据流
4. **设计系统一致性**：全部使用 `ds-*` CSS token + Material Symbols + Manrope/Inter 双字体

## 设计稿位置

所有原型 HTML 文件已下载到 `design-draft/` 目录，每个页面有 v1 和 v2 两个变体（优先使用 v1）。

## 实施阶段

---

### Phase 1：核心用户路径（已完成）

| 页面 | 路由 | 设计稿 | 状态 | 说明 |
|------|------|--------|------|------|
| Dashboard | `/dashboard` | `Dashboard (Full Redesign)/code.html` | ✅ 已完成 | Bento Grid 布局、余额卡、低余额 Banner、4 图表、Recent Calls 表 |
| Logs | `/logs` | `Logs (Full Redesign)/code.html` | ✅ 已完成 | Filter Chips、搜索框、日期筛选、行内展开详情、数字分页 |
| Audit Log Detail | `/logs/[traceId]` | `Audit Log Detail/code.html` | ✅ 已完成（新页面） | Trace 头部、Stats Bento、Prompt/Response 分栏、JSON 参数 |

---

### Phase 2：高频使用页面

| 页面 | 路由 | 设计稿 | 状态 | 说明 |
|------|------|--------|------|------|
| Balance | `/balance` | `Balance (Full Redesign)/code.html` | 待实施 | Bento 余额卡、告警阈值卡、交易记录表 |
| Recharge Modal | `/balance` 弹窗 | `Recharge Balance Modal/code.html` | 待实施 | 快捷金额、自定义输入、支付方式选择 |
| Usage Analytics | `/usage` | `Usage Analytics (Strict Redesign)/code.html` | 待实施 | 时间段选择器、Bento 统计卡、图表、Model Ranking 表 |
| Models | `/models` | `Models (Full Redesign)/code.html` | 待实施 | 统计卡、Provider 分组列表、搜索 + Modality 筛选 |

**Phase 2 变更明细：**

#### Balance (`/balance`)

- **现有数据源**：`/api/projects/{id}/balance`、`/api/projects/{id}/transactions`、`/api/projects/{id}/recharge`、`PATCH /api/projects/{id}`
- **布局变更**：
  - 余额卡改为 Bento Grid（渐变紫色大卡 + 上次充值信息）
  - 告警阈值卡独立区域
  - 交易记录表样式更新（Type 徽章、金额颜色区分）
- **充值弹窗**：按 `Recharge Balance Modal/code.html` 重写弹窗样式
- **不改**：充值逻辑、支付宝/微信跳转、金额校验

#### Usage Analytics (`/usage`)

- **现有数据源**：`/api/projects/{id}/usage`、`/api/projects/{id}/usage/daily`、`/api/projects/{id}/usage/by-model`
- **布局变更**：
  - 时间段按钮（today/7d/30d）改为 Chip 样式
  - Summary Cards 改为 Bento 统计卡
  - 趋势指标：前端请求两次（当期 + 上期），计算环比百分比
  - 图表样式更新（Glassmorphism tooltip）
  - Model Ranking 表样式更新
- **不改**：数据获取逻辑、API 调用

#### Models (`/models`)

- **现有数据源**：`GET /v1/models`
- **布局变更**：
  - 新增统计卡区域（Total Models 数量、Avg Latency 显示 "—" 占位）
  - Provider 分组列表样式更新
  - 搜索框 + Modality 筛选按钮样式更新
- **决策**："Active Regions" 指标去掉（我们没有多区域部署）；"Avg Latency" 显示 "—" 占位
- **不改**：模型数据获取、客户端过滤逻辑

---

### Phase 3：管理员页面

| 页面 | 路由 | 设计稿 | 状态 | 说明 |
|------|------|--------|------|------|
| Admin: Providers | `/admin/providers` | `Admin - Providers (Full Redesign)/code.html` | 待实施 | 表格 + 新建/编辑/Config 弹窗样式更新 |
| Admin: Health | `/admin/health` | `Admin - Health (Full Redesign)/code.html` | 待实施 | Summary Cards + 健康卡片网格 |
| Admin: Logs | `/admin/logs` | `Admin - Logs (Full Redesign)/code.html` | 待实施 | 表格 + Filter 样式 |
| Admin: Usage | `/admin/usage` | `Admin - Usage (Full Redesign)/code.html` | 待实施 | Bento 统计卡 + 图表 + Provider 表 |
| Admin: Users | `/admin/users` | `Admin - Users (Full Redesign)/code.html` | 待实施 | 表格样式更新 |

**Phase 3 变更明细：**

#### Admin: Providers (`/admin/providers`)

- **现有数据源**：`/api/admin/providers`、`POST/PATCH /api/admin/providers/{id}`、`/api/admin/providers/{id}/config`
- **布局变更**：表格样式（Material Design 3 行）、弹窗样式（Glassmorphism）
- **不改**：CRUD 逻辑、Config Override 逻辑、状态切换

#### Admin: Health (`/admin/health`)

- **现有数据源**：`/api/admin/health`、`POST /api/admin/health/{channelId}/check`
- **布局变更**：Summary Cards（Active/Degraded/Disabled 计数）、健康卡片改为 Bento 网格
- **不改**：手动检查触发、状态颜色逻辑

#### Admin: Logs (`/admin/logs`)

- **现有数据源**：`/api/admin/logs`、`/api/admin/logs/search`
- **布局变更**：Filter Chips + 表格样式（与用户侧 Logs 风格一致）
- **不改**：搜索、分页、状态筛选

#### Admin: Usage (`/admin/usage`)

- **现有数据源**：`/api/admin/usage`、`/api/admin/usage/by-provider`、`/api/admin/usage/by-model`
- **布局变更**：Bento 统计卡（Calls/Revenue/Cost/Margin）、图表样式更新
- **不改**：时间段切换、数据获取

#### Admin: Users (`/admin/users`)

- **现有数据源**：`/api/admin/users`
- **布局变更**：表格样式更新
- **不改**：用户列表数据获取

---

### Phase 4：辅助页面

| 页面 | 路由 | 设计稿 | 状态 | 说明 |
|------|------|--------|------|------|
| Quick Start | `/quickstart` | `Quick Start (Full Redesign)/code.html` | 待实施 | 步骤卡片 + 代码块样式 |
| MCP Setup | `/mcp-setup` | `MCP Setup (Full Redesign)/code.html` | 待实施 | 步骤布局 + Key 选择器 + Config 代码块 |
| Settings | `/settings` | `Settings (Full Redesign)/code.html` | 待实施 | Profile/Password/通知/退出 卡片 |

**Phase 4 变更明细：**

#### Quick Start (`/quickstart`)

- **现有数据源**：无 API（纯静态内容）
- **布局变更**：步骤卡片带编号徽章、代码块暗色主题 + 复制按钮
- **不改**：代码示例内容、复制功能

#### MCP Setup (`/mcp-setup`)

- **现有数据源**：`/api/projects/{id}/keys`（获取 API Key 列表）
- **布局变更**：3 步骤网格布局、API Key 选择器样式、Tab 切换样式、Config JSON 代码块
- **不改**：Key 选择逻辑、Config 生成逻辑、Tab 切换

#### Settings (`/settings`)

- **现有数据源**：`/api/auth/profile`、`PATCH /api/auth/profile`、`POST /api/auth/change-password`
- **布局变更**：Profile/Password/通知/退出 分为独立卡片区域
- **不改**：表单验证、密码修改、退出逻辑

---

### Phase 5：新增页面 + 特殊页面

| 页面 | 路由 | 设计稿 | 状态 | 说明 |
|------|------|--------|------|------|
| API Key Settings | `/keys/[keyId]` | `API Key Settings - AIGC Gateway/code.html` | 待实施（新页面） | Key 详情编辑页 |
| Admin: User Detail | `/admin/users/[id]` | `Admin - User Detail/code.html` | 待实施 | 用户详情页样式 |
| Login | `/login` | `Login (Terminal Simulation)/code.html` | 待实施 | Terminal 动画 + 登录表单 |

**Phase 5 变更明细：**

#### API Key Settings (`/keys/[keyId]`)

- **后端 API**：`GET/PATCH /api/projects/{id}/keys/{keyId}` — 已实现
- **功能**：展示 Key 详情（name/description/permissions/expiresAt/rateLimit/ipWhitelist），编辑并保存
- **注意**：这是新建页面，需要同时写数据获取逻辑和 JSX

#### Admin: User Detail (`/admin/users/[id]`)

- **后端 API**：`GET /api/admin/users/{id}` — 已存在
- **功能**：用户 Profile、项目列表、余额信息
- **决策**："停用用户"和"重置余额"按钮如果 API 不支持，渲染为 disabled

#### Login (`/login`)

- **后端 API**：`POST /api/auth/login` — 已存在
- **布局变更**：Split 布局（左侧 Terminal 动画 + 右侧登录表单）
- **不改**：登录逻辑、表单验证、错误处理

---

## 已推迟

| 页面 | 原因 |
|------|------|
| API Key Insights (`/keys/[keyId]/insights`) | 需要后端扩展：单 Key 调用统计、按 Key 筛选日志。待后续实施 |

## 后端决策记录

| 缺口 | 决策 | 处理方式 |
|------|------|---------|
| API Key Insights 单 Key 统计 | 推迟 | 先实现 Key Settings 编辑页 |
| Usage 趋势指标（+12.5% vs last period） | 前端双请求 | 请求当期和上期各一次，前端计算环比 |
| Models 页 Avg Latency | 占位 | 显示 "—" |
| Models 页 Active Regions | 去掉 | 设计稿虚构概念，我们没有多区域部署 |
| Admin User Detail 停用/重置按钮 | disabled | 按钮渲染为 disabled，后续按需扩展 API |

## 测试要点

### 每个页面通用检查项

- [ ] 页面正常加载，无 JS 错误
- [ ] 数据正确展示（与旧版一致）
- [ ] i18n 切换中/英文正常，无 key 泄漏
- [ ] 空状态正常展示（无项目 / 无数据）
- [ ] Loading 骨架屏正常
- [ ] 响应式：在 1280px / 1920px 宽度下布局正常

### Phase 1 专项检查（已完成，需验证）

**Dashboard (`/dashboard`)**
- [ ] 4 张统计卡数据正确（Total Calls / Cost / Latency / Success Rate）
- [ ] 余额卡显示当前余额，点击 Recharge 跳转 `/balance`
- [ ] 低余额 Banner 在余额低于阈值时显示
- [ ] 14 天柱状图有数据渲染
- [ ] 饼图显示模型分布 + 百分比图例
- [ ] 24h 分布图正常
- [ ] Daily Spend 图正常
- [ ] Recent Calls 表显示 5 条，点击 View All 跳转 `/logs`
- [ ] 状态徽章颜色正确（SUCCESS=绿 / ERROR=红 / FILTERED=琥珀）

**Logs (`/logs`)**
- [ ] 状态 Filter Chips 切换正常（All / Success / Errors / Filtered）
- [ ] 搜索框 300ms 防抖后触发搜索
- [ ] 日期范围筛选正常
- [ ] 表格 20 行分页
- [ ] 数字分页按钮正常
- [ ] 点击行展开详情面板
- [ ] 详情面板：指标网格 4 列正确
- [ ] 详情面板：Prompt Messages 按 role 分色（SYSTEM=灰 / USER=紫边）
- [ ] 详情面板：Response Content 正常显示
- [ ] 详情面板：JSON Parameters 暗色代码块
- [ ] 再次点击同一行收起详情
- [ ] ERROR 状态行展开时显示错误信息（红色背景）

**Audit Log Detail (`/logs/[traceId]`) — 新页面**
- [ ] 直接访问 `/logs/{traceId}` 正常加载
- [ ] Breadcrumb "Call Logs" 链接跳转回 `/logs`
- [ ] Trace ID + 状态徽章 + 时间 + 延迟显示正确
- [ ] Copy Trace ID 按钮复制到剪贴板
- [ ] Stats Bento：Model / Tokens / Cost / Throughput 4 卡正确
- [ ] Prompt Messages 按 role 分色显示
- [ ] Response Content 正常显示
- [ ] Request Parameters JSON 暗色代码块
- [ ] Metadata 表信息正确
- [ ] 无 Prompt / Response 时显示占位文字
- [ ] 不存在的 traceId 显示 "Trace not found"

### Phase 2 专项检查

**Balance (`/balance`)**
- [ ] 余额卡显示当前余额（余额低时红色）
- [ ] 充值按钮打开 Recharge Modal
- [ ] Recharge Modal：快捷金额按钮（$10/$50/$100/$500）
- [ ] Recharge Modal：自定义金额输入 + 校验（1-10000）
- [ ] Recharge Modal：支付方式切换
- [ ] 告警阈值输入 + 保存
- [ ] 交易记录表分页
- [ ] 金额颜色：正数绿、负数灰

**Usage Analytics (`/usage`)**
- [ ] 时间段按钮切换（today / 7d / 30d）
- [ ] 4 张统计卡数据正确
- [ ] 趋势百分比显示（与上一周期对比）
- [ ] Daily Calls 面积图正常
- [ ] Daily Cost 柱状图正常
- [ ] Model Distribution 饼图正常
- [ ] Model Ranking 表正常

**Models (`/models`)**
- [ ] 统计卡：Total Models 数量正确、Avg Latency 显示 "—"
- [ ] 搜索框实时过滤
- [ ] Modality 按钮（All / Text / Image）切换正常
- [ ] Provider 分组折叠/展开
- [ ] 超过 20 个模型时 Show All 按钮

### Phase 3 专项检查

**Admin: Providers**
- [ ] 表格显示所有服务商
- [ ] Add Provider 打开新建弹窗
- [ ] Edit 打开编辑弹窗（预填数据）
- [ ] Config 打开 Config Override 弹窗
- [ ] Status 徽章点击切换

**Admin: Health**
- [ ] Summary Cards 计数正确（Active / Degraded / Disabled）
- [ ] 健康卡片网格显示
- [ ] Check 按钮触发检查 + loading 状态

**Admin: Logs**
- [ ] 搜索 + 状态筛选 + 分页正常

**Admin: Usage**
- [ ] 时间段切换 + 4 统计卡 + 图表 + Provider 表

**Admin: Users**
- [ ] 用户列表表格 + Detail 链接

### Phase 4 专项检查

**Quick Start**
- [ ] 4 个步骤卡片正常渲染
- [ ] 代码块复制按钮

**MCP Setup**
- [ ] API Key 下拉选择
- [ ] Tab 切换（Claude / Cursor / Generic）
- [ ] Config 代码块 + 复制

**Settings**
- [ ] Profile：Email 只读、Name 可编辑 + 保存
- [ ] 密码修改：校验 + 提交
- [ ] Sign Out 按钮

### Phase 5 专项检查

**API Key Settings (`/keys/[keyId]`)**
- [ ] 页面正常加载 Key 详情
- [ ] 编辑字段：name / description / permissions / expiresAt / rateLimit / ipWhitelist
- [ ] 保存后数据持久化
- [ ] 导航回 `/keys` 列表

**Admin: User Detail**
- [ ] 用户信息正确
- [ ] 项目列表显示
- [ ] 停用/重置按钮为 disabled

**Login**
- [ ] Terminal 动画渲染
- [ ] 登录表单提交正常
- [ ] 错误提示正常
