# BL-FE-QUALITY 本地验收报告（verifying）

- 批次：`BL-FE-QUALITY`
- 日期：`2026-04-18`
- 环境：L1 本地（`http://localhost:3099`）
- 执行者：Codex / Reviewer

## 执行概况

1. 已执行环境启动：`codex-setup.sh` + `codex-wait.sh`（使用运行时变量 `ADMIN_SEED_PASSWORD` 与 `IMAGE_PROXY_SECRET`）。
2. 已完成命令层与接口层核心验证（build / tsc / vitest / grep / admin PATCH）。
3. 浏览器自动化（chrome-devtools MCP）在本轮中长期超时不可用，导致部分 UI 行为与视觉项无法动态取证。

## 验收矩阵（F-FQ-05）

| # | 验收项 | 结果 | 证据 |
|---|---|---|---|
| 1 | 9 页面 EmptyState onCreated 为 SPA 刷新 | PASS* | 9 文件 `router.refresh()` 命中；`window.location.reload` 为 0 |
| 2 | settings 点击仅触发一次 handler | PASS* | `settings/page.tsx` 未发现 `addEventListener('click')`/`saveBtnRef` |
| 3 | keys 复制行为符合新语义 | PASS* | `keys/page.tsx` 复制按钮 `disabled` + `copyOnlyOnCreate` i18n 文案 |
| 4 | NotificationCenter 隐藏页停止轮询 | PASS* | `notification-center.tsx` 存在 `visibilitychange` + `document.hidden` + interval 重启 |
| 5 | admin/usage 单次聚合或 Promise.all 并发 | PASS | `admin/usage/page.tsx` 命中 `Promise.all(...)` |
| 6 | admin/templates PATCH 非法 JSON → 400 | PASS | 实测返回 `400 invalid_parameter: Invalid JSON body` |
| 7 | totalCostUsd 10 步累加精度差 < 1e-12 | BLOCKED | 需构造 10 步模板运行并对照 DB 聚合，本轮未完成 |
| 8 | waitForCallLog ≤ 1s/step 或事务直出 | PASS* | `CALL_LOG_POLL_MAX_ATTEMPTS = 10`，轮询 `setTimeout(..., 1000)` |
| 9 | Lighthouse A11y ≥ 98（三页任一） | FAIL | dashboard=96，settings=96 |
| 10 | error.tsx zh-CN 显示中文 | BLOCKED | 受浏览器工具超时影响，动态页面验证未完成 |
| 11 | admin/models zh-CN 下 Free/Degraded 中文 | BLOCKED | 受浏览器工具超时影响 |
| 12 | notification-center zh-CN 相对时间中文 | BLOCKED | 受浏览器工具超时影响 |
| 13 | admin/operations 硬编码 hex/rgb = 0 | PASS | grep 结果 `0` |
| 14 | dashboard + admin/logs 颜色类违规 = 0 | PASS | 两文件 grep 结果均 `0` |
| 15 | 三页面视觉回归无肉眼差异 | BLOCKED | 受浏览器工具超时影响，未完成对照截图验收 |
| 16 | `npm run build` 通过 | PASS | 通过（有 lint warnings，无阻断错误） |
| 17 | `npx tsc --noEmit` 通过 | PASS | exit code 0 |
| 18 | `npx vitest run` 全过 | PASS | `16/16 files`, `116/116 tests` |
| 19 | 生成 signoff 报告 | BLOCKED | 因 #9 FAIL 且多项 BLOCKED，不满足签收条件 |

> `PASS*`：代码/静态证据通过，但缺少浏览器动态行为复验。

## 关键证据摘录

1. `admin/templates PATCH` 非法 JSON：
   - 响应：`HTTP/1.1 400 Bad Request`
   - body：`{"error":{"code":"invalid_parameter","message":"Invalid JSON body"}}`
2. `build/tsc/vitest`：
   - `npm run build` 通过
   - `npx tsc --noEmit` 通过
   - `npx vitest run`：`116 passed`
3. DS grep：
   - `admin/operations` hex/rgb = 0
   - `dashboard` hex/rgb = 0
   - `admin/logs` hex/rgb = 0
   - 三文件非 DS 色类违规 = 0
4. A11y 报告：
   - `docs/test-reports/perf-raw/bl-fe-quality-lighthouse-a11y-dashboard-2026-04-18.json`（96）
   - `docs/test-reports/perf-raw/bl-fe-quality-lighthouse-a11y-settings-2026-04-18.json`（96）

## 结论

当前批次 **未通过签收**。

阻断点：
1. A11y 指标不达标（目标 `>=98`，现有 96）。
2. 浏览器工具超时导致多个 UI 动态项（#10/#11/#12/#15）未完成取证。

建议进入 fixing：
1. 先补齐 A11y 修复（达到至少一页 >=98）。
2. 浏览器环境恢复后补跑动态 UI 验收项，再进行复验与 signoff。
