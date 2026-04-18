# BL-FE-QUALITY 复验报告（reverifying / round2）

- 批次：`BL-FE-QUALITY`
- 日期：`2026-04-18`
- 环境：L1 本地（`http://localhost:3099`）
- 执行者：Codex / Reviewer

## 本轮目标

复验 fix round 1（主要针对 A11y 96 的修复），并补齐上轮阻塞项。

## 复验结果总览

| # | 验收项 | 结果 | 说明 |
|---|---|---|---|
| 1 | 9 页面 EmptyState onCreated SPA 刷新 | PASS* | 代码证据保持成立（9 处 `router.refresh()`） |
| 2 | settings 点击一次触发 | PASS* | 代码证据：无 `addEventListener('click')` |
| 3 | keys 复制策略 | PASS* | `copyOnlyOnCreate` 文案 + disabled |
| 4 | notification 可见性门控 | PASS* | 代码证据：`visibilitychange` + `document.hidden` |
| 5 | admin/usage Promise.all 并发 | PASS | 代码命中 `Promise.all` |
| 6 | admin/templates 非法 JSON → 400 | PASS | 实测 `400 invalid_parameter` |
| 7 | totalCostUsd 精度差 < 1e-12 | BLOCKED | 需构造 10 步模板运行与 DB 对账，本轮未完成 |
| 8 | waitForCallLog ≤1s/step 或事务直出 | PASS* | 代码证据：`CALL_LOG_POLL_MAX_ATTEMPTS=10` |
| 9 | Lighthouse A11y ≥ 98 | FAIL | 认证态 `/dashboard` 实测 `96` |
| 10 | error.tsx zh-CN 中文 | BLOCKED | 浏览器动态取证链路不稳定，本轮未完成 |
| 11 | admin/models zh-CN Free/Degraded 中文 | BLOCKED | 需页面动态数据配合，本轮未完成 |
| 12 | notification-center zh-CN 相对时间中文 | BLOCKED | 需通知数据与稳定浏览器取证，本轮未完成 |
| 13 | admin/operations 硬编码 hex/rgb=0 | PASS | grep=0 |
| 14 | dashboard + admin/logs 颜色类违规=0 | PASS | grep=0 |
| 15 | 视觉回归无明显差异 | BLOCKED | 缺稳定“前后对照”截图链路 |
| 16 | npm run build 通过 | PASS | `codex-setup.sh` 内构建通过 |
| 17 | npx tsc --noEmit 通过 | PASS | build 阶段类型检查通过 |
| 18 | npx vitest run 全过 | FAIL | `dispatcher.test.ts` 2 条失败（114/116） |
| 19 | 生成 signoff | BLOCKED | 有 FAIL，不满足签收条件 |

> `PASS*`：基于代码证据成立，未完成浏览器动态行为取证。

## 关键证据

1. A11y（认证态 dashboard）：
   - 文件：`docs/test-reports/perf-raw/bl-fe-quality-lighthouse-a11y-dashboard-auth-2026-04-18.json`
   - `finalUrl=http://localhost:3099/dashboard`
   - `accessibility=96`

2. admin templates PATCH 非法 JSON：
   - `HTTP/1.1 400 Bad Request`
   - `{"error":{"code":"invalid_parameter","message":"Invalid JSON body"}}`

3. DS grep：
   - `admin/operations` / `dashboard` / `admin/logs` 的 hex/rgb 与非 ds 色类检查均为 `0`

4. vitest 回归失败：
   - 失败文件：`src/lib/notifications/dispatcher.test.ts`
   - 失败用例：2 条
   - 汇总：`1 failed | 15 passed (16)`，`2 failed | 114 passed (116)`

## 结论

本轮复验 **未通过**，需继续 `fixing`。

阻断点：
1. A11y 仍未达标（96 < 98）。
2. `vitest` 新增回归失败（2 条）。
3. 多项 UI 动态项仍需稳定浏览器链路补证（#10/#11/#12/#15）。
