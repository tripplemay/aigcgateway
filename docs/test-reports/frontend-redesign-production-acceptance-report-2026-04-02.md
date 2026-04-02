# 前端重构生产环境验收报告

## 测试目标

基于以下文档，对已部署生产环境执行前端重构验收：

- [frontend-redesign-plan.md](/Users/yixingzhou/project/aigcgateway/docs/frontend-redesign-plan.md)
- [frontend-redesign-api-test-cases-2026-04-02.md](/Users/yixingzhou/project/aigcgateway/docs/test-reports/frontend-redesign-api-test-cases-2026-04-02.md)
- [frontend-redesign-manual-test-cases-2026-04-02.md](/Users/yixingzhou/project/aigcgateway/docs/test-reports/frontend-redesign-manual-test-cases-2026-04-02.md)

验收目标：

- 设计稿 1:1 落地情况
- 原有功能在新 UI 下是否可用
- 新增 API / 页面是否可用
- 关键数据链路是否被前端重构破坏

## 测试环境

- 环境：生产环境
- 基础地址：`https://aigc.guangai.ai`
- 执行日期：`2026-04-02`
- 生产测试开关：
  - `PRODUCTION_STAGE=RND`
  - `PRODUCTION_DB_WRITE=ALLOW`
  - `HIGH_COST_OPS=ALLOW`

## 测试范围

- 用户端：`/login` `/dashboard` `/keys` `/keys/[keyId]` `/models` `/logs` `/usage` `/balance` `/quickstart` `/mcp-setup` `/settings`
- 管理端：`/admin/providers` `/admin/health` `/admin/logs` `/admin/usage` `/admin/users` `/admin/users/[id]`
- 相关 API：
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `GET/PATCH /api/auth/profile`
  - `POST /api/auth/change-password`
  - `POST /api/projects`
  - `PATCH /api/projects/:id`
  - `GET /api/projects/:id/balance`
  - `GET /api/projects/:id/transactions`
  - `GET /api/projects/:id/usage*`
  - `GET /api/projects/:id/logs`
  - `GET /api/projects/:id/keys`
  - `GET /api/projects/:id/keys/:keyId`
  - `GET /v1/models`
  - `POST /api/v1/chat/completions`
  - `GET /api/admin/providers`
  - `GET /api/admin/health`
  - `GET /api/admin/users*`

## 测试数据

- 测试用户：
  - `prod.frontend.redesign.20260402140416@example.com`
  - userId: `cmnh2ks23000lrnedf0zavy70`
- 测试项目：
  - `Prod Frontend Redesign QA 20260402140503`
  - projectId: `cmnh2lsay0010rnedtavrx27m`
- 测试 Key：
  - `Primary Key` `cmnh2m4br001grned5xw0kgfa`
  - `Staging Key` `cmnh2m4s6001nrnedigyghths`
  - `Readonly Key` `cmnh2m58y001prnedlxyz7u12`
- 充值：
  - 管理端为测试项目加款 `$20`
- 运行时样本：
  - 使用 `Primary Key` 成功调用 1 次 `POST /api/v1/chat/completions`

## 执行步骤概述

1. 先做生产 smoke，确认首页和基础模型接口可访问
2. 创建隔离测试用户、测试项目和测试 Key
3. 通过管理接口为测试项目加款，构造余额 / 交易数据
4. 执行用户侧 API 链路验证
5. 执行管理员 API 链路验证
6. 通过浏览器执行用户侧与管理员页面手工验收
7. 对失败项做最小复核，区分前端问题和接口问题

## 通过项

- 生产环境基础可用：
  - `GET /` 返回 `200`
  - `GET /api/v1/models` 返回 `200`
- 登录链路可用：
  - 用户注册成功
  - 用户登录成功
  - 管理员登录成功
- `/login` 已按终端模拟风格重构，生产环境中不再是旧版普通表单页
- 用户项目创建成功，项目 PATCH 更新 `alertThreshold=5` 成功
- `/balance` 数据链路可用：
  - `GET /api/projects/:id/balance` 返回余额与阈值
  - `GET /api/projects/:id/transactions?page=1&pageSize=20` 返回分页与交易数据
  - 页面显示 `$20.00`，与 API 一致
- `/models` 页面可加载，UI 总数 `471` 与 `GET /v1/models` 一致
- `/quickstart` 页面可加载，4 个步骤卡和代码块可见，复制按钮点击后切换为 `check`
- `/mcp-setup` 页面可加载：
  - 三步骤结构存在
  - Claude Code / Cursor / 通用格式 Tab 可切换
  - 代码块内容随 Tab 切换更新
- `/settings` 页面可加载：
  - Email 只读
  - Name 可编辑
  - UI 点击“保存”后，`PATCH /api/auth/profile` 返回 `200`
  - 刷新后通过 `GET /api/auth/profile` 可见新值
- 用户侧共享布局余额已正确显示 `$20.00`
- 管理端页面可加载：
  - `/admin/providers`
  - `/admin/health`
  - `/admin/logs`
  - `/admin/usage`
  - `/admin/users`
  - `/admin/users/[id]`
- `/admin/users/[id]` 中停用 / 重置类按钮仍为 disabled，没有误开放
- 管理员 API 基本链路可用：
  - `GET /api/admin/providers` 返回 7 个 provider
  - `GET /api/admin/health` 返回 `active=466 degraded=0 disabled=54 total=520`
  - `GET /api/admin/users` 可看到测试用户
  - `GET /api/admin/users/:id` 可看到测试用户项目和 3 条 Key

## 失败项

### 1. 共享布局与多页面仍存在大面积图标名 / 文案 key 泄漏

- 现象：
  - 用户端和管理员端多页面直接展示图标字面量，如 `search` `smart_toy` `terminal` `payments` `rocket_launch` `electrical_services`
  - `/admin/usage` 还出现 i18n key 泄漏：`ADMINUSAGE.TOTALCALLS` `ADMINUSAGE.COST`
- 实际影响：
  - 不满足“1:1 还原设计稿样式”
  - 页面观感明显异常
- 严重级别：中

### 2. `/keys/[keyId]` 前端页面无法进入可用状态

- 现象：
  - 直接访问 `https://aigc.guangai.ai/keys/cmnh2m58y001prnedlxyz7u12`
  - 页面长期停留在全页 `Loading...`
  - 对应详情 API `GET /api/projects/:id/keys/:keyId` 返回正常
  - 浏览器网络中 `/_next/static/chunks/app/(console)/keys/[keyId]/page-493939b83ef863c5.js` 处于 `pending`
- 实际影响：
  - 新增页 `/keys/[keyId]` 未完成可用交付
- 严重级别：高

### 3. Key 列表接口分页 contract 错误，直接破坏 `/keys` 与 `/mcp-setup`

- 现象：
  - 请求 `GET /api/projects/:id/keys?page=1&pageSize=20`
  - 返回 `pagination.limit=1 total=3`
  - 第 1 页只返回 1 条 Key
  - 第 2 页、第 3 页分别各返回 1 条 Key
- 页面表现：
  - `/keys` 只显示 `1 / 1 keys`
  - `/mcp-setup` 的 API Key 下拉也只出现 1 条 `Readonly Key`
- 实际影响：
  - 列表页和 MCP 配置页都无法完整消费项目下多条 Key
- 严重级别：高

### 4. 成功的运行时调用没有进入项目级 Logs / Usage / Dashboard

- 现象：
  - 使用 `Primary Key` 成功调用 `POST /api/v1/chat/completions`
  - 返回正常文本 `OK`
  - 但随后：
    - `GET /api/projects/:id/usage?period=7d` 仍为 `totalCalls=0 totalCost=0`
    - `GET /api/projects/:id/usage/daily?period=7d` 返回 `[]`
    - `GET /api/projects/:id/usage/by-model?period=7d` 返回 `[]`
    - `GET /api/projects/:id/logs?page=1&pageSize=20` 返回空列表
  - 前端对应页面 `/dashboard` `/usage` `/logs` 也都显示空态
- 实际影响：
  - 用户端的核心数据面板与日志面板不可用
  - 无法证明“原有功能可正常使用”
- 严重级别：高

### 5. `/settings` 密码修改错误态前端挂起

- 现象：
  - 在 `/settings` 输入错误旧密码后点击“修改密码”
  - 浏览器发出了 `POST /api/auth/change-password`
  - 该请求在前端页面中持续 `pending`
  - 同样参数用 curl 直接调用接口时，服务端立即返回 `401 invalid_credentials`
- 实际影响：
  - 前端没有正确消费错误响应
  - 用户看不到明确错误反馈
- 严重级别：中

## 风险项

- 管理端 `/admin/health` 返回汇总数字正常，但 `channels` 数组为空，页面当前主要依赖 summary；是否存在后端聚合缺口，需要开发继续确认。
- 管理端共享布局余额显示 `$50.00`，该值来源于管理员自身项目而非当前查看对象；虽然不是本轮主验收目标，但容易引起误读。
- 本轮为了最小必要原则，没有执行支付下单落地，也没有执行成功密码修改路径，因此这两条仍留有覆盖缺口。

## 未执行项

- Recharge Modal 真正提交支付订单：
  - 原因：虽然当前生产开关允许写入，但支付 / 外部扣费类动作仍属于高风险动作，未获得针对该动作的单独授权。
- `/settings` 成功修改密码路径：
  - 原因：错误态已暴露前端挂起问题；在生产上继续推进成功改密会扩大会话变更范围，当前先停在错误态验收。
- `/settings` Sign Out：
  - 原因：非高风险，但不影响本轮主要验收结论，且当前已有更高优先级阻塞项。

## 证据

- [frontend-redesign-production-2026-04-02-keys-blank.png](/Users/yixingzhou/project/aigcgateway/docs/test-reports/frontend-redesign-production-2026-04-02-keys-blank.png)
- [frontend-redesign-production-2026-04-02-key-settings-loading.png](/Users/yixingzhou/project/aigcgateway/docs/test-reports/frontend-redesign-production-2026-04-02-key-settings-loading.png)
- [frontend-redesign-production-2026-04-02-mcp-setup.png](/Users/yixingzhou/project/aigcgateway/docs/test-reports/frontend-redesign-production-2026-04-02-mcp-setup.png)
- [frontend-redesign-production-2026-04-02-quickstart.png](/Users/yixingzhou/project/aigcgateway/docs/test-reports/frontend-redesign-production-2026-04-02-quickstart.png)
- [frontend-redesign-production-2026-04-02-settings.png](/Users/yixingzhou/project/aigcgateway/docs/test-reports/frontend-redesign-production-2026-04-02-settings.png)
- [frontend-redesign-production-2026-04-02-admin-users.png](/Users/yixingzhou/project/aigcgateway/docs/test-reports/frontend-redesign-production-2026-04-02-admin-users.png)
- [frontend-redesign-production-2026-04-02-admin-usage.png](/Users/yixingzhou/project/aigcgateway/docs/test-reports/frontend-redesign-production-2026-04-02-admin-usage.png)

## 最终结论

本轮生产环境验收结论为：`FAIL`。

原因不是基础站点不可用，而是仍存在多条直接阻塞验收的缺陷：

- `/keys/[keyId]` 页面不可用
- Key 列表分页 contract 错误，导致 `/keys` 与 `/mcp-setup` 数据不完整
- 运行时成功调用无法进入项目级 `logs / usage / dashboard`
- 多页面存在明显图标名与 i18n key 泄漏，不满足“1:1 还原设计稿样式”
- `/settings` 密码错误态前端挂起

因此当前不能签收为“前端重构已在生产环境完成验收通过”。
