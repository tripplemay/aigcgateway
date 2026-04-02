# 前端重构生产环境问题修复回归报告

## 测试目标

仅回归验证上一轮生产验收报告中的失败项修复情况：

- [frontend-redesign-production-acceptance-report-2026-04-02.md](/Users/yixingzhou/project/aigcgateway/docs/test-reports/frontend-redesign-production-acceptance-report-2026-04-02.md)

回归项包括：

1. 图标名 / i18n key 泄漏
2. `/keys/[keyId]` 页面不可用
3. Key 列表分页 contract 错误，导致 `/keys` 与 `/mcp-setup` 数据不完整
4. 运行时成功调用没有进入项目级 `logs / usage / dashboard`
5. `/settings` 密码修改错误态前端挂起

## 测试环境

- 环境：生产环境
- 基础地址：`https://aigc.guangai.ai`
- 执行日期：`2026-04-02`
- 生产测试开关：
  - `PRODUCTION_STAGE=RND`
  - `PRODUCTION_DB_WRITE=ALLOW`
  - `HIGH_COST_OPS=ALLOW`

## 测试数据

沿用上一轮隔离测试数据：

- 测试用户：`prod.frontend.redesign.20260402140416@example.com`
- 用户 ID：`cmnh2ks23000lrnedf0zavy70`
- 测试项目：`Prod Frontend Redesign QA 20260402140503`
- 项目 ID：`cmnh2lsay0010rnedtavrx27m`
- 目标 Key：
  - `Primary Key` `cmnh2m4br001grned5xw0kgfa`
  - `Readonly Key` `cmnh2m58y001prnedlxyz7u12`

本轮额外执行了 1 次最小运行时请求：

- `POST /api/v1/chat/completions`
- 返回 `OK`
- trace id: `trc_o2b6i94jav89kexhn9f82t1i`

## 执行步骤概述

1. 先做生产 smoke，确认站点与基础模型接口仍可访问
2. 复查 Key 列表 API、Key 详情 API、项目级 usage / logs API
3. 再打 1 次最小 `chat/completions` 请求，复查 usage / logs 是否入账
4. 用浏览器回归 `/keys`、`/keys/[keyId]`、`/settings`、`/admin/usage`
5. 汇总修复情况

## 通过项

### 1. `/keys/[keyId]` 页面已修复

- 当前直接访问：
  - `https://aigc.guangai.ai/keys/cmnh2m58y001prnedlxyz7u12`
- 页面已可正常加载：
  - Breadcrumb 存在
  - `Readonly Key` 名称正确
  - General Information / Permissions / Security & Limits / Danger Zone 都可见
  - 与详情 API 返回数据一致

结论：上一轮“全页长期停留 Loading”的问题已修复。

### 2. `/settings` 密码错误态“前端挂起”已修复

- 在浏览器中输入错误旧密码并提交后：
  - 前端发起 `POST /api/auth/change-password`
  - 本轮网络状态返回 `401`
  - 不再像上一轮那样持续 `pending`
- 同样参数用 curl 直调接口，仍立即返回：
  - `401 invalid_credentials`

结论：上一轮“请求一直 pending”的问题已修复。

## 失败项

### 1. Key 列表分页 contract 仍未修复

- 请求：
  - `GET /api/projects/cmnh2lsay0010rnedtavrx27m/keys?page=1&pageSize=20`
- 实际返回：
  - `pagination.page=1`
  - `pagination.limit=1`
  - `pagination.total=3`
  - 只返回 1 条 `Readonly Key`
- 页面表现：
  - `/keys` 仍显示 `1 / 1 keys`
  - 只看到 1 条 Key，而不是项目下的 3 条 Key

结论：未修复。

### 2. 运行时成功调用仍然不会进入项目级 `logs / usage`

- 本轮最小运行时调用已成功：
  - `POST /api/v1/chat/completions`
  - 返回内容 `OK`
- 但随后复查：
  - `GET /api/projects/:id/usage?period=7d` 仍为 `totalCalls=0`
  - `GET /api/projects/:id/usage/daily?period=7d` 返回 `[]`
  - `GET /api/projects/:id/usage/by-model?period=7d` 返回 `[]`
  - `GET /api/projects/:id/logs?page=1&pageSize=20` 返回空列表

结论：未修复。

### 3. 图标名 / i18n key 泄漏仍未修复

- 用户侧仍可见大量图标字面量：
  - `/keys`：`search` `developer_board` `speed` `lock` `autorenew` `policy`
  - `/keys/[keyId]`：`badge` `shield_person` `lock_reset` `warning` `dangerous`
  - `/settings`：`search` `smart_toy` `terminal` `bar_chart` `payments` `rocket_launch` `electrical_services` `notifications` `dark_mode` `notifications_active` `logout`
- 管理端 `/admin/usage` 仍出现 i18n key：
  - `ADMINUSAGE.TOTALCALLS`
  - `ADMINUSAGE.COST`

结论：未修复。

## 风险项

- 本轮在一个旧浏览器上下文里访问 `/keys` 时出现过一次页面 `Loading...` 卡住，但在新的同上下文页面里可稳定打开并复现真实问题为“只显示 1 条”。当前更可信的主结论仍是分页 contract 错误，而不是页面彻底不可用。
- `/settings` 错误态请求已不再 pending，但当前浏览器快照里没有稳定捕捉到明确错误文案；因此只能确认“挂起问题已修”，不能确认“错误提示体验已完全达标”。

## 证据

- [frontend-redesign-production-recheck-2026-04-02-keys.png](/Users/yixingzhou/project/aigcgateway/docs/test-reports/frontend-redesign-production-recheck-2026-04-02-keys.png)
- [frontend-redesign-production-recheck-2026-04-02-key-settings.png](/Users/yixingzhou/project/aigcgateway/docs/test-reports/frontend-redesign-production-recheck-2026-04-02-key-settings.png)
- [frontend-redesign-production-recheck-2026-04-02-settings.png](/Users/yixingzhou/project/aigcgateway/docs/test-reports/frontend-redesign-production-recheck-2026-04-02-settings.png)
- [frontend-redesign-production-recheck-2026-04-02-admin-usage.png](/Users/yixingzhou/project/aigcgateway/docs/test-reports/frontend-redesign-production-recheck-2026-04-02-admin-usage.png)

## 最终结论

本轮上一轮问题修复回归结论为：`PARTIAL PASS`。

修复情况汇总：

- 已修复：
  - `/keys/[keyId]` 页面可用
  - `/settings` 密码错误态请求不再 pending
- 未修复：
  - Key 列表分页 contract 错误
  - 项目级 `logs / usage` 数据链路缺失
  - 图标名 / i18n key 泄漏

因此当前仍不能签收为“上一轮生产问题已全部修复”。
