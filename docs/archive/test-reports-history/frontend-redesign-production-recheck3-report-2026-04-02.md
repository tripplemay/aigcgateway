# 前端重构生产环境问题修复三次回归报告

## 测试目标

继续回归上一轮仍未关闭的问题，并确认已修项没有回退：

- [frontend-redesign-production-recheck2-report-2026-04-02.md](/Users/yixingzhou/project/aigcgateway/docs/test-reports/frontend-redesign-production-recheck2-report-2026-04-02.md)

本轮重点关注：

1. 项目级 `logs / usage` 数据链路
2. 图标字面量泄漏
3. 已修项是否回退

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
- Primary Key：`cmnh2m4br001grned5xw0kgfa`

本轮额外执行了 1 次最小运行时请求：

- `POST /api/v1/chat/completions`
- 返回 `OK`
- trace id: `trc_c24d0yohfjglsfzhll0x1ys4`

## 通过项

### 1. 项目级 `logs / usage` 数据链路已修复

- 先执行：
  - `POST /api/v1/chat/completions`
  - 返回 `OK`
- 3 秒后复查：
  - `GET /api/projects/:id/usage?period=7d`
    - `totalCalls=1`
    - `totalTokens=10`
    - `totalCost=0.00000353`
  - `GET /api/projects/:id/usage/daily?period=7d`
    - 返回当日 1 条聚合数据
  - `GET /api/projects/:id/logs?page=1&pageSize=20`
    - 返回 trace `trc_c24d0yohfjglsfzhll0x1ys4`
    - `status=SUCCESS`
    - `promptPreview="Reply with OK only."`

结论：上一轮“运行时成功调用不会进入项目级 usage / logs”的问题已修复。

### 2. 已修项未回退

- `/keys` 仍显示 `3 / 3 keys`
- `GET /api/projects/:id/keys?page=1&pageSize=20` 仍返回 3 条，`limit=20`
- `/admin/usage` 仍显示正常文案：
  - `总调用量`
  - `成本`

结论：本轮未发现回退。

## 失败项

### 1. 图标字面量泄漏仍未修复

- 用户侧 `/keys` 仍可见：
  - `search`
  - `developer_board`
  - `speed`
  - `lock`
  - `autorenew`
  - `policy`
- 管理端 `/admin/usage` 仍可见：
  - 侧边栏与顶部：`search` `smart_toy` `terminal` `bar_chart` `payments` `rocket_launch` `electrical_services` `hub` `settings_input_component` `health_and_safety` `receipt_long` `monitoring` `group` `notifications` `dark_mode`
  - 统计卡内：`trending_up` `payments` `savings`

结论：未修复。

## 风险项

- 当前功能链路已基本恢复，但图标字面量泄漏覆盖范围仍广，属于持续性的 UI 质量问题，仍不满足“1:1 还原设计稿样式”的验收口径。

## 证据

- [frontend-redesign-production-recheck3-2026-04-02-keys.png](/Users/yixingzhou/project/aigcgateway/docs/test-reports/frontend-redesign-production-recheck3-2026-04-02-keys.png)
- [frontend-redesign-production-recheck3-2026-04-02-admin-usage.png](/Users/yixingzhou/project/aigcgateway/docs/test-reports/frontend-redesign-production-recheck3-2026-04-02-admin-usage.png)

## 最终结论

本轮三次回归结论为：`PARTIAL PASS`。

与上一轮相比，新增确认的修复项有：

- 项目级 `logs / usage` 数据链路已修复

当前剩余未关闭问题只剩 1 类：

- 图标字面量泄漏

因此当前仍不能签收为“上一轮所有生产问题已全部修复”，但阻塞项已从功能链路问题收敛为 UI 还原问题。
