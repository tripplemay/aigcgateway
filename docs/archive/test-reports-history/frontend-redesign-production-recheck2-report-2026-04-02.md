# 前端重构生产环境问题修复二次回归报告

## 测试目标

继续回归上一轮仍未关闭的问题，并确认已修项没有回退：

- [frontend-redesign-production-recheck-report-2026-04-02.md](/Users/yixingzhou/project/aigcgateway/docs/test-reports/frontend-redesign-production-recheck-report-2026-04-02.md)

本轮重点关注：

1. Key 列表分页 contract
2. 项目级 `logs / usage` 数据链路
3. 图标字面量 / i18n key 泄漏
4. `/keys/[keyId]` 页面是否仍可用
5. `/settings` 密码错误态是否仍正常返回

## 测试环境

- 环境：生产环境
- 基础地址：`https://aigc.guangai.ai`
- 执行日期：`2026-04-02`
- 生产测试开关：
  - `PRODUCTION_STAGE=RND`
  - `PRODUCTION_DB_WRITE=ALLOW`
  - `HIGH_COST_OPS=ALLOW`

## 测试数据

- 测试用户：`prod.frontend.redesign.20260402140416@example.com`
- 项目 ID：`cmnh2lsay0010rnedtavrx27m`
- Readonly Key：`cmnh2m58y001prnedlxyz7u12`
- Primary Key：`cmnh2m4br001grned5xw0kgfa`

本轮额外执行了 1 次最小运行时请求：

- `POST /api/v1/chat/completions`
- 返回 `OK`
- trace id: `trc_o2b6i94jav89kexhn9f82t1i`

## 通过项

### 1. Key 列表分页 contract 已修复

- 请求：
  - `GET /api/projects/cmnh2lsay0010rnedtavrx27m/keys?page=1&pageSize=20`
- 当前返回：
  - 3 条数据
  - `pagination.limit=20`
  - `pagination.total=3`
- 浏览器刷新后 `/keys` 页面也已同步：
  - 显示 `3 / 3 keys`
  - 3 条 Key 都可见

结论：该问题已修复。

### 2. `/keys/[keyId]` 页面未回退

- 仍可正常打开 `Readonly Key` 详情页
- 页面结构、字段和按钮区仍可见

结论：保持已修状态。

### 3. `/settings` 错误旧密码请求未回退

- 本轮继续确认：
  - `POST /api/auth/change-password` 错误旧密码时返回 `401`
  - 不再出现之前的 `pending`

结论：保持已修状态。

### 4. `/admin/usage` 的 i18n key 已修复

- 上一轮页面里的：
  - `ADMINUSAGE.TOTALCALLS`
  - `ADMINUSAGE.COST`
- 当前已经显示为正常文案：
  - `总调用量`
  - `成本`

结论：这部分已修复。

## 失败项

### 1. 项目级 `logs / usage` 数据链路仍未修复

- 本轮再次成功执行：
  - `POST /api/v1/chat/completions`
  - 返回内容 `OK`
- 随后复查：
  - `GET /api/projects/:id/usage?period=7d` 仍为 `totalCalls=0`
  - `GET /api/projects/:id/logs?page=1&pageSize=20` 仍为空
- 说明运行时请求尚未进入项目级统计与日志链路

结论：未修复。

### 2. 图标字面量泄漏仍未修复

- 用户侧 `/keys` 仍可见：
  - `search`
  - `developer_board`
  - `speed`
  - `lock`
  - `autorenew`
  - `policy`
- 管理端 `/admin/usage` 仍可见多处图标字面量：
  - `search`
  - `smart_toy`
  - `terminal`
  - `bar_chart`
  - `payments`
  - `rocket_launch`
  - `electrical_services`
  - `hub`
  - `settings_input_component`
  - `health_and_safety`
  - `receipt_long`
  - `monitoring`
  - `group`
  - `notifications`
  - `dark_mode`
  - `trending_up`
  - `payments`
  - `savings`

结论：未修复。

## 风险项

- `/keys` 页面需要强制刷新后才与新 API 结果对齐，本轮没有再复现旧的 1 条数据状态，但说明用户端可能受缓存或已有标签页状态影响。
- 项目级 `usage / logs` 未入账时，Dashboard / Logs / Usage 三个主页面仍不能完成业务验收。

## 证据

- [frontend-redesign-production-recheck2-2026-04-02-keys.png](/Users/yixingzhou/project/aigcgateway/docs/test-reports/frontend-redesign-production-recheck2-2026-04-02-keys.png)
- [frontend-redesign-production-recheck2-2026-04-02-admin-usage.png](/Users/yixingzhou/project/aigcgateway/docs/test-reports/frontend-redesign-production-recheck2-2026-04-02-admin-usage.png)

## 最终结论

本轮二次回归结论为：`PARTIAL PASS`。

与上一轮相比，新增确认的修复项有：

- Key 列表分页 contract 已修复
- `/admin/usage` 的 i18n key 已修复

当前仍未关闭的阻塞项只剩 2 类：

- 项目级 `logs / usage` 数据链路缺失
- 图标字面量泄漏

因此当前仍不能签收为“上一轮所有生产问题已全部修复”。
