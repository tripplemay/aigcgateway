# 前端重构本地验收报告

## 测试目标

基于 [frontend-redesign-plan.md](/Users/yixingzhou/project/aigcgateway/docs/frontend-redesign-plan.md)、[frontend-redesign-api-test-cases-2026-04-02.md](/Users/yixingzhou/project/aigcgateway/docs/test-reports/frontend-redesign-api-test-cases-2026-04-02.md) 和 [frontend-redesign-manual-test-cases-2026-04-02.md](/Users/yixingzhou/project/aigcgateway/docs/test-reports/frontend-redesign-manual-test-cases-2026-04-02.md)，在本地 `3099` 测试环境验证本轮前端重构是否满足：

- 1:1 还原 `design-draft/` v1 设计稿
- 原有功能在新 UI 下保持可用
- 新增页面和新增 API 能正常工作

## 测试环境

- 环境类型：本地测试环境
- 目标地址：`http://localhost:3099`
- 启动方式：前台执行 `bash scripts/test/codex-setup.sh`
- Smoke 说明：本机设置了 `http_proxy/https_proxy/all_proxy`，本轮 CLI 接口验证统一使用 `curl --noproxy '*'`
- 角色：
  - 普通用户：`frontend.qa.20260402115229@example.com`
  - 管理员：`admin@aigc-gateway.local`

## 测试范围

- 登录页 `/login`
- 用户侧：`/dashboard` `/balance` `/models` `/mcp-setup` `/settings` `/quickstart` `/usage` `/logs` `/keys/[keyId]`
- 管理员侧：`/admin/providers` `/admin/health` `/admin/users` `/admin/users/[id]`
- API / 集成链路：
  - `POST /api/auth/login`
  - `GET/PATCH /api/auth/profile`
  - `GET /v1/models`
  - `GET /api/projects/:id/balance`
  - `GET /api/projects/:id/transactions`
  - `PATCH /api/projects/:id`
  - `GET /api/projects/:id/keys`
  - `GET/PATCH /api/projects/:id/keys/:keyId`
  - `GET /api/projects/:id/usage`
  - `GET /api/projects/:id/usage/daily`
  - `GET /api/projects/:id/usage/by-model`
  - `GET /api/projects/:id/logs`
  - `GET /api/admin/providers`
  - `GET /api/admin/health`
  - `GET /api/admin/users`
  - `GET /api/admin/users/:id`

## 执行步骤概述

1. 读取测试计划、现有 API/手工用例和本轮重构计划书。
2. 用 `codex-setup.sh` 重建本地测试环境并确认 `3099` 可访问。
3. 在本地创建普通测试用户、项目、API Key，并为测试项目充值。
4. 先执行 API / 集成 smoke，确认重构页面依赖的数据链路仍可用。
5. 使用 Chrome MCP 分别以普通用户和管理员身份进行页面验收。
6. 对保存类接口做最小必要回写验证，并尽量回滚测试数据。

## 通过项

- 本地环境可成功启动，`/`、`/login`、`/v1/models` 均可访问。
- `POST /api/auth/login` 普通用户和管理员登录链路正常。
- `GET /v1/models` 正常返回模型列表，当前本地环境返回约 279 条模型。
- `GET /api/projects/:id/balance`、`GET /api/projects/:id/transactions`、`GET /api/projects/:id/usage*`、`GET /api/projects/:id/logs` 均可返回可消费 contract。
- `PATCH /api/projects/:id` 可保存 `alertThreshold`。
- `GET/PATCH /api/auth/profile` 可读取并保存 `name`。
- `GET /api/projects/:id/keys` 和 `GET/PATCH /api/projects/:id/keys/:keyId` 可读取并更新 Key 详情。
- `GET /api/admin/providers`、`GET /api/admin/health`、`GET /api/admin/users`、`GET /api/admin/users/:id` 可正常返回数据。
- 新增页 `/keys/[keyId]` 已上线，首屏可加载，字段能够正确回填。
- 管理员页 `/admin/providers`、`/admin/health`、`/admin/users`、`/admin/users/[id]` 首屏可正常加载。

## 失败项

### 1. 登录页未按设计稿 1:1 还原

- 严重级别：High
- 页面：`/login`
- 现象：
  - 当前页面是普通居中登录表单。
  - 未看到计划书要求的 Terminal 动画 + Split 布局。
- 预期：
  - 应按 `design-draft/Login (Terminal Simulation)/code.html` 还原。

### 2. 大范围图标文本泄漏，Material Symbols 未正确渲染

- 严重级别：High
- 影响页面：
  - `/dashboard`
  - `/balance`
  - `/models`
  - `/mcp-setup`
  - `/settings`
  - `/quickstart`
  - `/usage`
  - `/logs`
  - `/keys/[keyId]`
  - 管理员页侧边栏和若干按钮
- 现象：
  - 页面直接显示 `search`、`smart_toy`、`payments`、`electrical_services`、`notifications_active`、`content_copy`、`settings_input_component` 等字面文本。
- 预期：
  - 应显示 Material Symbols 图标，不应把 icon name 暴露给用户。

### 3. 大范围 i18n key 泄漏

- 严重级别：High
- 影响页面：
  - `/dashboard`
  - `/balance`
  - `/logs`
- 现象：
  - 可见 `dashboard.subtitle`、`COMMON.BALANCE`、`balance.alertDescription`、`logs.showing`、`common.of`、`logs.traces` 等原始 key。
- 预期：
  - 页面应显示已翻译文案，不应暴露原始 i18n key。

### 4. 侧边栏钱包余额长期显示 `$0.00`，与真实项目余额不一致

- 严重级别：High
- 影响页面：
  - 普通用户与管理员进入的几乎所有重构页
- 现象：
  - 当前测试项目余额为 `$50.00`，`/balance` 主卡也显示 `$50.00`。
  - 但侧边栏“钱包余额”一直显示 `$0.00`。
- 预期：
  - 共享布局中的余额展示应与当前项目真实余额保持一致，或明确采用空态/未选择项目逻辑，不能稳定误导用户。

### 5. `/models` 总数与接口数据不一致

- 严重级别：Medium
- 页面：`/models`
- 现象：
  - 页面显示 `TOTAL MODELS = 280`
  - 同时 `GET /v1/models` 返回数量约为 `279`
- 预期：
  - 页面统计卡应与实际数据源一致。

### 6. `/usage` 在零数据场景下展示误导性文案和指标

- 严重级别：Medium
- 页面：`/usage`
- 现象：
  - `GET /api/projects/:id/usage` 返回 `totalCalls=0`、`totalCost=0`
  - 页面仍展示 `100% UTILIZED`
  - 多张卡片同时显示 `Stable activity`
- 预期：
  - 零数据场景应使用清晰空态或中性占位，不应给出误导性正向指标。

### 7. 新增 Key 设置页对应的保存链路无法清空已设置权限

- 严重级别：Medium
- 页面/API：
  - `/keys/[keyId]`
  - `PATCH /api/projects/:id/keys/:keyId`
- 复现：
  - 先将 Key 权限更新为 `{"projectInfo": true, "chatCompletion": false}`
  - 再发送 `permissions: {}`
- 实际结果：
  - 返回结果和后续 GET 读取仍保留之前的权限值。
- 预期结果：
  - 传空对象应能清空权限设置，或 contract 必须明确拒绝并返回错误，而不是静默保留旧值。

## 风险项

- `/dashboard`、`/logs`、`/usage` 的深层“非空数据展示”验证仍不充分。
  - 本地当前没有真实调用日志数据。
  - `GET /api/projects/:id/logs` 和 `GET /api/admin/logs` 都返回空列表。
  - 因此未完整验证：
    - `/logs` 行内展开详情
    - `/logs/[traceId]` 详情页
    - `/dashboard` Recent Calls 非空状态
    - `/admin/logs` 非空列表与筛选
    - `/admin/usage` 非空图表与排行
- 之前本地环境曾出现 `call_logs` 写入异常线索，本轮没有通过修改产品实现去处理，因此这部分仍建议开发侧单独确认。

## 未完成项 / 阻塞项

- `BLOCKED`：`/logs/[traceId]` 新页面的真实详情内容校验。
  - 原因：本轮本地无可用 trace 数据。
- `BLOCKED`：`/admin/logs` 与 `/admin/usage` 的非空数据验收。
  - 原因：本轮仅能完成接口 smoke 和空态验证，无法完成真实数据态图表/表格核对。

## 证据

- [frontend-redesign-login-2026-04-02.png](/Users/yixingzhou/project/aigcgateway/docs/test-reports/frontend-redesign-login-2026-04-02.png)
- [frontend-redesign-dashboard-2026-04-02.png](/Users/yixingzhou/project/aigcgateway/docs/test-reports/frontend-redesign-dashboard-2026-04-02.png)
- [frontend-redesign-balance-2026-04-02.png](/Users/yixingzhou/project/aigcgateway/docs/test-reports/frontend-redesign-balance-2026-04-02.png)
- [frontend-redesign-models-2026-04-02.png](/Users/yixingzhou/project/aigcgateway/docs/test-reports/frontend-redesign-models-2026-04-02.png)
- [frontend-redesign-key-settings-2026-04-02.png](/Users/yixingzhou/project/aigcgateway/docs/test-reports/frontend-redesign-key-settings-2026-04-02.png)
- [frontend-redesign-mcp-setup-2026-04-02.png](/Users/yixingzhou/project/aigcgateway/docs/test-reports/frontend-redesign-mcp-setup-2026-04-02.png)
- [frontend-redesign-settings-2026-04-02.png](/Users/yixingzhou/project/aigcgateway/docs/test-reports/frontend-redesign-settings-2026-04-02.png)
- [frontend-redesign-admin-providers-2026-04-02.png](/Users/yixingzhou/project/aigcgateway/docs/test-reports/frontend-redesign-admin-providers-2026-04-02.png)
- [frontend-redesign-admin-health-2026-04-02.png](/Users/yixingzhou/project/aigcgateway/docs/test-reports/frontend-redesign-admin-health-2026-04-02.png)
- [frontend-redesign-admin-users-2026-04-02.png](/Users/yixingzhou/project/aigcgateway/docs/test-reports/frontend-redesign-admin-users-2026-04-02.png)

## 最终结论

本轮结论为 `FAIL`。

原因不是“页面打不开”，而是“核心页面虽然大多已可访问，但未达到计划书要求的 1:1 还原质量，且存在广泛的图标/文案泄漏与共享布局数据错误”。新增页 `/keys/[keyId]` 已基本接通，但其对应的权限清空保存链路仍存在问题。另有一部分日志/用量深链路因本地缺少非空调用数据，当前只能记为 `BLOCKED`，不能宣称已完整验收通过。
