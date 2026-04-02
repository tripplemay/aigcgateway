# 前端重构本地重测报告

## 测试目标

对上一轮 [frontend-redesign-local-validation-report-2026-04-02.md](/Users/yixingzhou/project/aigcgateway/docs/test-reports/frontend-redesign-local-validation-report-2026-04-02.md) 中的失败项进行最小必要回归。

## 测试环境

- 环境类型：本地测试环境
- 地址：`http://localhost:3099`
- 启动方式：`bash scripts/test/codex-restart.sh`
- 说明：CLI 请求统一使用 `curl --noproxy '*'`

## 本轮执行内容

- 重启本地测试环境并确认 `/v1/models` 就绪
- 回归 `/login`、`/dashboard`、`/models`、`/usage`、`/logs`
- 回归 `PATCH /api/projects/:id/keys/:keyId` 的 `permissions={}` 清空行为

## 通过项

- `PATCH /api/projects/:id/keys/:keyId` 现在可以正确清空权限。
  - 发送 `permissions: {}` 后，返回值和后续 GET 读取都为 `{}`。
- `/dashboard` 与 `/balance` 的 i18n key 泄漏已明显改善。
  - 之前出现的 `dashboard.subtitle`、`COMMON.BALANCE`、`balance.alertDescription` 本轮未再复现。
- `/models` 统计总数已与 `/v1/models` 对齐。
  - 本轮页面显示 `317`
  - `GET /v1/models` 也返回 `317`
- `/usage` 零数据空态已修正。
  - 之前的 `100% UTILIZED` 已变为 `— / NO DATA`
- `/logs` 分页区的 i18n key 泄漏已修正。
  - 之前的 `logs.showing`、`common.of`、`logs.traces` 本轮未再复现。

## 仍失败项

### 1. 登录页仍未按设计稿落地

- 严重级别：High
- 页面：`/login`
- 实际结果：
  - 仍是普通居中登录表单。
  - 没有 Terminal 动画，也没有左右分栏结构。
- 预期结果：
  - 应按 `design-draft/Login (Terminal Simulation)/code.html` 还原。

### 2. Material Symbols 图标名泄漏仍然广泛存在

- 严重级别：High
- 影响页面：
  - `/dashboard`
  - `/models`
  - `/usage`
  - `/logs`
  - 侧边栏和顶部工具栏
- 实际结果：
  - 仍能看到 `search`、`smart_toy`、`terminal`、`payments`、`electrical_services`、`notifications`、`dark_mode`、`account_balance_wallet` 等文本直接展示。
- 预期结果：
  - 应渲染为图标，而不是把 icon name 暴露在页面上。

### 3. 共享布局中的钱包余额仍错误

- 严重级别：High
- 影响页面：
  - `/dashboard`
  - `/models`
  - `/usage`
  - `/logs`
- 实际结果：
  - 当前测试项目真实余额仍为 `$50.00`
  - 侧边栏“钱包余额”仍固定显示 `$0.00`
- 预期结果：
  - 应显示当前项目余额，或采用明确的未选择项目逻辑，不能持续误导。

## 风险项

- 本轮没有新增非空调用日志数据，因此：
  - `/logs/[traceId]`
  - `/dashboard` Recent Calls 非空态
  - `/admin/logs` 非空列表
  - `/admin/usage` 非空图表
  仍未在真实数据态下完成回归。

## 最终结论

本轮结论为 `PARTIAL PASS`。

上一轮的部分失败项已经修复，尤其是：
- Key 设置页权限清空
- 多处 i18n key 泄漏
- `/models` 总数统计
- `/usage` 零数据占位

但前端重构的核心验收仍不能通过，原因是：
- `/login` 仍未按设计稿落地
- 图标渲染问题仍是全局性缺陷
- 共享布局余额显示仍错误
