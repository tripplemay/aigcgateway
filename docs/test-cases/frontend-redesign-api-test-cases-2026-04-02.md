# 前端重构 API / 集成测试用例

## 测试目标

基于 [frontend-redesign-plan.md](/Users/yixingzhou/project/aigcgateway/docs/frontend-redesign-plan.md)、现有路由实现与 `design-draft/` 对应原型目录，整理本轮前端重构的 API / 集成测试用例。

本文件仅定义待执行用例，不代表已执行。

## 测试范围

- 重构后页面的数据链路不被破坏
- 既有 API contract 在新 UI 下仍可正常消费
- 新增页面 `/keys/[keyId]` 的 GET / PATCH 链路可用
- 关键弹窗、筛选、分页、保存操作的请求序列正确
- 登录、Profile、Password、Admin 明细页等高频链路回归

## 源文档

- [frontend-redesign-plan.md](/Users/yixingzhou/project/aigcgateway/docs/frontend-redesign-plan.md)
- `design-draft/Balance (Full Redesign)/code.html`
- `design-draft/Recharge Balance Modal/code.html`
- `design-draft/Usage Analytics (Strict Redesign)/code.html`
- `design-draft/Models (Full Redesign)/code.html`
- `design-draft/Admin - Providers (Full Redesign)/code.html`
- `design-draft/Admin - Health (Full Redesign)/code.html`
- `design-draft/Admin - Logs (Full Redesign)/code.html`
- `design-draft/Admin - Usage (Full Redesign)/code.html`
- `design-draft/Admin - Users (Full Redesign)/code.html`
- `design-draft/Quick Start (Full Redesign)/code.html`
- `design-draft/MCP Setup (Full Redesign)/code.html`
- `design-draft/Settings (Full Redesign)/code.html`
- `design-draft/API Key Settings - AIGC Gateway/code.html`
- `design-draft/Admin - User Detail/code.html`
- `design-draft/Login (Terminal Simulation)/code.html`

## 测试环境

- 环境类型：待定，默认本地测试环境
- 目标地址：`http://localhost:3099`
- 角色：
  - 普通已登录用户
  - 管理员
  - 未登录用户

## 场景矩阵

Scenario: Balance 数据链路
Business Requirement: `/balance` 与充值弹窗换皮后仍使用原有余额、交易、充值、阈值 API
Endpoints: `GET /api/projects/:id/balance` `GET /api/projects/:id/transactions` `POST /api/projects/:id/recharge` `PATCH /api/projects/:id`
Auth Context: 用户 JWT
Primary Risk: 新 UI 参数、分页、保存动作与旧 contract 不一致

Scenario: Usage Analytics 数据链路
Business Requirement: `/usage` 新布局不改变 usage / daily / by-model 三段数据获取逻辑
Endpoints: `GET /api/projects/:id/usage` `GET /api/projects/:id/usage/daily` `GET /api/projects/:id/usage/by-model`
Auth Context: 用户 JWT
Primary Risk: 时间段切换、环比双请求或图表数据映射出错

Scenario: Models 列表
Business Requirement: `/models` 仍通过 `GET /v1/models` 获取数据，搜索与 modality 仅前端过滤
Endpoints: `GET /v1/models`
Auth Context: 可匿名或带用户态访问
Primary Risk: 新筛选控件误触发不存在的后端参数，或过滤逻辑破坏现有列表

Scenario: API Key Settings 新页面
Business Requirement: `/keys/[keyId]` 新页面可正确读取和保存单 Key 设置
Endpoints: `GET /api/projects/:id/keys/:keyId` `PATCH /api/projects/:id/keys/:keyId`
Auth Context: 用户 JWT
Primary Risk: 新增页面数据获取、字段映射、保存回写不稳定

Scenario: Admin Providers / Health / Logs / Usage / Users
Business Requirement: 管理员页换皮后 CRUD、筛选、检查、分页、详情入口仍可用
Endpoints: `GET/POST/PATCH /api/admin/providers*` `GET /api/admin/health` `POST /api/admin/health/:channelId/check` `GET /api/admin/logs*` `GET /api/admin/usage*` `GET /api/admin/users*`
Auth Context: 管理员 JWT
Primary Risk: 角色权限、筛选参数、弹窗保存被 UI 重构破坏

Scenario: Settings / Login / MCP Setup
Business Requirement: 辅助页重构后仍可登录、更新 Profile、改密码、选择 Key 生成 MCP 配置
Endpoints: `POST /api/auth/login` `GET/PATCH /api/auth/profile` `POST /api/auth/change-password` `GET /api/projects/:id/keys`
Auth Context: 未登录 / 用户 JWT
Primary Risk: 表单重构破坏提交流程与错误处理

## 前置条件

- 测试环境存在至少 1 个普通用户和 1 个管理员
- 普通用户至少拥有 1 个项目，并具备：
  - 余额与告警阈值
  - 交易记录
  - usage / daily / by-model 数据
  - 至少 2 条 API Key
- 管理端存在：
  - 多个 provider
  - 多条 channel health 记录
  - admin logs / usage / users 数据
- 如需执行新增页面 `/keys/[keyId]`，后端 GET / PATCH 路由已可用

## 可执行测试用例

### A. Balance / Recharge

ID: API-UI-001
Title: `/balance` 首屏请求余额与最近充值信息
Priority: Critical
Requirement Source: `frontend-redesign-plan.md` Phase 2 Balance
Preconditions: 已登录用户；当前项目存在余额数据
Request Sequence:
1. GET `/api/projects/:id/balance`
   Payload:
   Expected Status: `200`
   Assertions:
   - 返回 `balance`
   - 返回 `alertThreshold`
   - 返回 `lastRecharge` 或 `null`
State Assertions:
- 响应字段足够驱动 Bento 余额卡与告警卡
Cleanup:
- 无
Notes / Risks:
- 该接口是 Balance 页重构的主数据源

ID: API-UI-002
Title: `/balance` 交易表分页 contract 保持兼容
Priority: High
Requirement Source: `frontend-redesign-plan.md` Phase 2 Balance
Preconditions: 当前项目存在多条交易记录
Request Sequence:
1. GET `/api/projects/:id/transactions?page=1&pageSize=20`
   Payload:
   Expected Status: `200`
   Assertions:
   - 返回 `data`
   - 返回 `pagination.page` `pagination.pageSize` `pagination.total`
2. GET `/api/projects/:id/transactions?page=2&pageSize=20`
   Payload:
   Expected Status: `200`
   Assertions:
   - 页码切换后数据与分页元信息正确
State Assertions:
- 新表格分页 UI 不需要额外后端改造
Cleanup:
- 无
Notes / Risks:
- 重点检查金额与余额字段类型仍为 number

ID: API-UI-003
Title: Recharge Modal 创建订单链路保持不变
Priority: Critical
Requirement Source: `frontend-redesign-plan.md` Phase 2 Balance
Preconditions: 已登录用户；当前项目可充值
Request Sequence:
1. POST `/api/projects/:id/recharge`
   Payload:
   - `{ "amount": 10, "paymentMethod": "alipay" }`
   Expected Status: `201`
   Assertions:
   - 返回 `orderId`
   - 返回 `paymentUrl`
   - 返回 `status=pending`
2. POST `/api/projects/:id/recharge`
   Payload:
   - `{ "amount": 10, "paymentMethod": "wechat" }`
   Expected Status: `201`
   Assertions:
   - 返回 `paymentUrl`
State Assertions:
- 重构后的支付方式切换仍映射到旧 contract
Cleanup:
- 不在生产环境自动执行
Notes / Risks:
- 若在生产执行需遵守支付副作用边界

ID: API-UI-004
Title: Recharge Modal 非法金额仍被后端拒绝
Priority: High
Requirement Source: `frontend-redesign-plan.md` Phase 2 Balance
Preconditions: 已登录用户
Request Sequence:
1. POST `/api/projects/:id/recharge`
   Payload:
   - `{ "amount": 0, "paymentMethod": "alipay" }`
   Expected Status: `422`
   Assertions:
   - 错误信息与 `amount` 相关
2. POST `/api/projects/:id/recharge`
   Payload:
   - `{ "amount": 10001, "paymentMethod": "wechat" }`
   Expected Status: `422`
   Assertions:
   - 错误信息明确
State Assertions:
- 新 UI 输入校验即使失效，后端仍能兜底
Cleanup:
- 无
Notes / Risks:
- 用于覆盖自定义金额输入区

ID: API-UI-005
Title: 告警阈值保存仍使用项目 PATCH
Priority: High
Requirement Source: `frontend-redesign-plan.md` Phase 2 Balance
Preconditions: 已登录用户；当前项目存在 alertThreshold
Request Sequence:
1. PATCH `/api/projects/:id`
   Payload:
   - `{ "alertThreshold": 5 }`
   Expected Status: `200`
   Assertions:
   - 返回 `alertThreshold=5`
2. GET `/api/projects/:id/balance`
   Payload:
   Expected Status: `200`
   Assertions:
   - 返回 `alertThreshold=5`
State Assertions:
- 告警阈值卡与保存按钮不需要新 API
Cleanup:
- 回写原阈值
Notes / Risks:
- 生产环境执行需最小必要变更

### B. Usage Analytics

ID: API-UI-101
Title: `/usage` 默认统计接口 contract 保持稳定
Priority: Critical
Requirement Source: `frontend-redesign-plan.md` Phase 2 Usage
Preconditions: 已登录用户；项目存在调用日志
Request Sequence:
1. GET `/api/projects/:id/usage?period=7d`
   Payload:
   Expected Status: `200`
   Assertions:
   - 返回 `period`
   - 返回 `totalCalls` `totalTokens` `totalCost`
   - 返回 `avgLatencyMs` `avgTtftMs` `successRate` `errorCount`
State Assertions:
- Bento Summary Cards 所需字段完整
Cleanup:
- 无
Notes / Risks:
- 环比前端双请求依赖该接口稳定

ID: API-UI-102
Title: `/usage` 时间段切换仍只依赖 `period` 参数
Priority: High
Requirement Source: `frontend-redesign-plan.md` Phase 2 Usage
Preconditions: 已登录用户
Request Sequence:
1. GET `/api/projects/:id/usage?period=today`
   Payload:
   Expected Status: `200`
   Assertions:
   - 返回 `period=today`
2. GET `/api/projects/:id/usage?period=30d`
   Payload:
   Expected Status: `200`
   Assertions:
   - 返回 `period=30d`
State Assertions:
- Chip 切换不引入新参数格式
Cleanup:
- 无
Notes / Risks:
- 重构后若改成别名参数，接口会直接暴露问题

ID: API-UI-103
Title: `/usage` 趋势图数据接口仍可供前端双请求计算环比
Priority: High
Requirement Source: `frontend-redesign-plan.md` 后端决策记录
Preconditions: 已登录用户
Request Sequence:
1. GET `/api/projects/:id/usage?period=7d`
   Payload:
   Expected Status: `200`
   Assertions:
   - 当前周期数据可读
2. GET `/api/projects/:id/usage?period=30d`
   Payload:
   Expected Status: `200`
   Assertions:
   - 响应格式一致
State Assertions:
- 前端可通过两次请求自行计算“vs last period”
Cleanup:
- 无
Notes / Risks:
- 这是计划书明确的前端双请求方案

ID: API-UI-104
Title: Daily Calls / Daily Cost 图表接口返回数组结构稳定
Priority: High
Requirement Source: `frontend-redesign-plan.md` Phase 2 Usage
Preconditions: 已登录用户
Request Sequence:
1. GET `/api/projects/:id/usage/daily?days=14`
   Payload:
   Expected Status: `200`
   Assertions:
   - 返回 `data[]`
   - 每项包含 `date` `calls` `cost` `tokens`
State Assertions:
- 新图表层不需额外转换后端结构
Cleanup:
- 无
Notes / Risks:
- 图表重构最容易在字段映射时断链

ID: API-UI-105
Title: Model Ranking 表接口返回排序字段稳定
Priority: High
Requirement Source: `frontend-redesign-plan.md` Phase 2 Usage
Preconditions: 已登录用户
Request Sequence:
1. GET `/api/projects/:id/usage/by-model`
   Payload:
   Expected Status: `200`
   Assertions:
   - 返回 `data[]`
   - 每项包含 `model` `calls` `tokens` `cost` `avgLatency`
State Assertions:
- 排名表重构仅换表现层
Cleanup:
- 无
Notes / Risks:
- 需关注空数组时的空态

### C. Models

ID: API-UI-201
Title: `/models` 仍使用 `GET /v1/models`
Priority: Critical
Requirement Source: `frontend-redesign-plan.md` Phase 2 Models
Preconditions: 页面可访问
Request Sequence:
1. GET `/v1/models`
   Payload:
   Expected Status: `200`
   Assertions:
   - 返回 `object=list`
   - 返回 `data[]`
   - 至少包含 `id` `display_name` `modality`
State Assertions:
- 新搜索框和 modality 按钮应基于这份数据前端过滤
Cleanup:
- 无
Notes / Risks:
- 计划书明确“不改模型数据获取、客户端过滤逻辑”

### D. API Key Settings 新页面

ID: API-UI-301
Title: `/keys/[keyId]` 首屏读取详情成功
Priority: Critical
Requirement Source: `frontend-redesign-plan.md` Phase 5 API Key Settings
Preconditions: 已登录用户；存在 ACTIVE Key
Request Sequence:
1. GET `/api/projects/:id/keys/:keyId`
   Payload:
   Expected Status: `200`
   Assertions:
   - 返回 `name` `description`
   - 返回 `permissions`
   - 返回 `expiresAt` `rateLimit` `ipWhitelist`
State Assertions:
- 新详情页能一次性拿齐展示和编辑字段
Cleanup:
- 无
Notes / Risks:
- 这是本轮新增页面的核心依赖

ID: API-UI-302
Title: `/keys/[keyId]` 保存基础字段成功
Priority: Critical
Requirement Source: `frontend-redesign-plan.md` Phase 5 API Key Settings
Preconditions: 已登录用户；存在可编辑 Key
Request Sequence:
1. PATCH `/api/projects/:id/keys/:keyId`
   Payload:
   - `{ "name": "Edited", "description": "Edited desc" }`
   Expected Status: `200`
   Assertions:
   - 返回更新后的 `name` `description`
2. GET `/api/projects/:id/keys/:keyId`
   Payload:
   Expected Status: `200`
   Assertions:
   - 新值持久化
State Assertions:
- 表单保存链路正常
Cleanup:
- 回写原值
Notes / Risks:
- 新页面是新增实现，高风险

ID: API-UI-303
Title: `/keys/[keyId]` 权限、过期、RPM、白名单保存成功
Priority: Critical
Requirement Source: `frontend-redesign-plan.md` Phase 5 API Key Settings
Preconditions: 已登录用户；存在可编辑 Key
Request Sequence:
1. PATCH `/api/projects/:id/keys/:keyId`
   Payload:
   - `permissions`
   - `expiresAt`
   - `rateLimit`
   - `ipWhitelist`
   Expected Status: `200`
   Assertions:
   - 返回值与提交一致
2. GET `/api/projects/:id/keys/:keyId`
   Payload:
   Expected Status: `200`
   Assertions:
   - 持久化成功
State Assertions:
- 新表单不会丢字段或错误覆盖
Cleanup:
- 回写原值
Notes / Risks:
- 覆盖新增 API 与新增页面的结合点

### E. Admin Pages

ID: API-UI-401
Title: `/admin/providers` 列表 contract 保持稳定
Priority: High
Requirement Source: `frontend-redesign-plan.md` Phase 3 Admin Providers
Preconditions: 管理员已登录
Request Sequence:
1. GET `/api/admin/providers`
   Payload:
   Expected Status: `200`
   Assertions:
   - 返回 `data[]`
   - 每项包含 `name` `displayName` `status` `channelCount` `hasConfig`
State Assertions:
- 新表格可直接消费现有字段
Cleanup:
- 无
Notes / Risks:
- Add/Edit/Config 弹窗全部依赖这份列表

ID: API-UI-402
Title: Provider 新建与编辑链路保持可用
Priority: High
Requirement Source: `frontend-redesign-plan.md` Phase 3 Admin Providers
Preconditions: 管理员已登录
Request Sequence:
1. POST `/api/admin/providers`
   Payload:
   - 最小合法服务商对象
   Expected Status: `201`
   Assertions:
   - 返回 provider 对象
2. PATCH `/api/admin/providers/:id`
   Payload:
   - 更新 `displayName` 或 `status`
   Expected Status: `200`
   Assertions:
   - 更新值生效
State Assertions:
- 新建/编辑弹窗仅换皮，不应改接口契约
Cleanup:
- 使用测试 provider，后续人工清理
Notes / Risks:
- 不在生产环境默认执行

ID: API-UI-403
Title: Provider Config Override 弹窗链路保持可用
Priority: High
Requirement Source: `frontend-redesign-plan.md` Phase 3 Admin Providers
Preconditions: 管理员已登录；存在 provider
Request Sequence:
1. GET `/api/admin/providers/:id/config`
   Payload:
   Expected Status: `200`
   Assertions:
   - 返回 `data`
2. PATCH `/api/admin/providers/:id/config`
   Payload:
   - 任意可接受配置字段
   Expected Status: `200`
   Assertions:
   - 返回 `data`
State Assertions:
- Config 弹窗不会因新 UI 丢失保存能力
Cleanup:
- 回写原值
Notes / Risks:
- 需在非生产环境优先执行

ID: API-UI-404
Title: `/admin/health` Summary 与手动检查链路保持可用
Priority: High
Requirement Source: `frontend-redesign-plan.md` Phase 3 Admin Health
Preconditions: 管理员已登录；存在 channel
Request Sequence:
1. GET `/api/admin/health`
   Payload:
   Expected Status: `200`
   Assertions:
   - 返回 `summary`
   - 返回 `data[]`
2. POST `/api/admin/health/:channelId/check`
   Payload:
   Expected Status: `200` 或定义内成功码
   Assertions:
   - 能返回检查结果或任务状态
State Assertions:
- 新健康卡片与 Check 按钮有可用后端支撑
Cleanup:
- 无
Notes / Risks:
- 手动检查可能触发外部探测，生产执行需控制

ID: API-UI-405
Title: `/admin/logs` 搜索、筛选、分页请求 contract 不变
Priority: High
Requirement Source: `frontend-redesign-plan.md` Phase 3 Admin Logs
Preconditions: 管理员已登录；存在日志数据
Request Sequence:
1. GET `/api/admin/logs`
   Payload:
   Expected Status: `200`
   Assertions:
   - 列表正常返回
2. GET `/api/admin/logs/search?q=test`
   Payload:
   Expected Status: `200`
   Assertions:
   - 搜索结果正常
State Assertions:
- Filter Chips / 搜索框换皮不改变查询契约
Cleanup:
- 无
Notes / Risks:
- 需要结合实际分页参数补充执行时断言

ID: API-UI-406
Title: `/admin/usage` 与分布图接口保持可用
Priority: High
Requirement Source: `frontend-redesign-plan.md` Phase 3 Admin Usage
Preconditions: 管理员已登录
Request Sequence:
1. GET `/api/admin/usage`
   Payload:
   Expected Status: `200`
   Assertions:
   - 统计概览返回
2. GET `/api/admin/usage/by-provider`
   Payload:
   Expected Status: `200`
   Assertions:
   - provider 分布返回
3. GET `/api/admin/usage/by-model`
   Payload:
   Expected Status: `200`
   Assertions:
   - model 分布返回
State Assertions:
- 新图表与 Provider 表有完整数据支持
Cleanup:
- 无
Notes / Risks:
- 主要防止时间段切换参数被重构破坏

ID: API-UI-407
Title: `/admin/users` 与 `/admin/users/:id` 详情链路保持可用
Priority: Critical
Requirement Source: `frontend-redesign-plan.md` Phase 3 Admin Users / Phase 5 Admin User Detail
Preconditions: 管理员已登录；存在用户数据
Request Sequence:
1. GET `/api/admin/users`
   Payload:
   Expected Status: `200`
   Assertions:
   - 用户列表可用
2. GET `/api/admin/users/:id`
   Payload:
   Expected Status: `200`
   Assertions:
   - 返回用户基础信息
   - 返回 `projects[]`
   - 每个项目包含 `balance` `callCount` `keyCount`
State Assertions:
- Detail 页重构不会丢失项目明细数据
Cleanup:
- 无
Notes / Risks:
- 停用/重置按钮不属于本轮 API 范围

### F. Quick Start / MCP Setup / Settings / Login

ID: API-UI-501
Title: `/mcp-setup` API Key 选择器仍读取 key 列表
Priority: High
Requirement Source: `frontend-redesign-plan.md` Phase 4 MCP Setup
Preconditions: 已登录用户；项目下存在多条 Key
Request Sequence:
1. GET `/api/projects/:id/keys`
   Payload:
   Expected Status: `200`
   Assertions:
   - 返回可供下拉选择的 Key 列表
State Assertions:
- 新三步布局与 Tab 不应改动 key 选择数据源
Cleanup:
- 无
Notes / Risks:
- 该页主要风险在前端状态，不在新 API

ID: API-UI-502
Title: `/settings` Profile 读取与保存链路保持可用
Priority: Critical
Requirement Source: `frontend-redesign-plan.md` Phase 4 Settings
Preconditions: 已登录用户
Request Sequence:
1. GET `/api/auth/profile`
   Payload:
   Expected Status: `200`
   Assertions:
   - 返回 `email` `name`
2. PATCH `/api/auth/profile`
   Payload:
   - `{ "name": "New Name" }`
   Expected Status: `200`
   Assertions:
   - 返回更新后的 `name`
State Assertions:
- Profile 卡片换皮不破坏保存
Cleanup:
- 回写原值
Notes / Risks:
- Email 仍应只读，不需要额外 PATCH 字段

ID: API-UI-503
Title: `/settings` 密码修改链路保持可用
Priority: High
Requirement Source: `frontend-redesign-plan.md` Phase 4 Settings
Preconditions: 已登录用户；知道当前密码
Request Sequence:
1. POST `/api/auth/change-password`
   Payload:
   - `{ "oldPassword": "...", "newPassword": "newpassword123" }`
   Expected Status: `200`
   Assertions:
   - 返回成功消息
State Assertions:
- 新密码表单与错误提示仍绑定旧接口
Cleanup:
- 用测试账号回切密码
Notes / Risks:
- 生产环境谨慎执行

ID: API-UI-504
Title: `/login` 登录提交 contract 保持稳定
Priority: Critical
Requirement Source: `frontend-redesign-plan.md` Phase 5 Login
Preconditions: 未登录；存在合法账号
Request Sequence:
1. POST `/api/auth/login`
   Payload:
   - `{ "email": "...", "password": "..." }`
   Expected Status: `200`
   Assertions:
   - 返回 `token`
   - 返回 `user`
2. POST `/api/auth/login`
   Payload:
   - 非法密码
   Expected Status: `401` 或定义内错误码
   Assertions:
   - 返回明确错误
State Assertions:
- Terminal 动画换皮不应影响表单逻辑
Cleanup:
- 无
Notes / Risks:
- 新登录页是高风险页面

## 执行顺序建议

1. 先做 smoke：`/login`、`/balance`、`/usage`、`/models`
2. 再做 Phase 2 主链路：Balance / Usage / Models
3. 再做新增页 `/keys/[keyId]`
4. 再做 Phase 3 管理员页
5. 最后做 Phase 4 / Phase 5 辅助页

## 高风险重点回归

- `/keys/[keyId]` 新页面是否真的打通 GET / PATCH
- Recharge Modal 是否在纯换皮后仍正确映射金额、支付方式和阈值保存
- `/usage` 的时间段按钮和前端双请求环比逻辑是否误改 contract
- `/models` 是否错误地把前端过滤改成后端过滤，导致多余参数或空列表
- Admin Providers 的 Add / Edit / Config 弹窗是否仍能回写
- Login / Settings 是否因表单重构破坏错误提示与提交

## 覆盖缺口与假设

- 本文聚焦“前端重构不改功能”的 API / 集成层验证，不覆盖视觉 1:1 还原细节；视觉还原由手工用例覆盖。
- `Quick Start` 主要是静态内容页，未单列 API 用例。
- `API Key Insights` 已在计划书中推迟，不纳入本轮测试集。

## 执行结果占位

- 当前状态：未执行
- 未执行原因：本轮仅按 `$prd-api-integration-test` 产出待执行用例，等待用户后续指令再执行测试
