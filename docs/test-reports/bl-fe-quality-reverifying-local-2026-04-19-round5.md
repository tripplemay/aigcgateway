# BL-FE-QUALITY 复验报告（reverifying / round5）

- 批次：`BL-FE-QUALITY`
- 日期：`2026-04-19`
- 环境：L1 本地（`http://localhost:3099`）
- 执行者：Codex / Reviewer

## 复验结果总览

| # | 验收项 | 结果 | 说明 |
|---|---|---|---|
| 1 | 9 页面 EmptyState onCreated SPA 刷新 | PASS* | 代码证据保持成立（9 处 `router.refresh()`） |
| 2 | settings 点击一次触发 | PASS* | 代码证据：无 `addEventListener('click')` |
| 3 | keys 复制策略 | PASS* | `copyOnlyOnCreate` 文案 + disabled |
| 4 | notification 可见性门控 | PASS* | 代码证据：`visibilitychange` + `document.hidden` |
| 5 | admin/usage Promise.all 并发 | PASS | 代码证据保持成立 |
| 6 | admin/templates 非法 JSON → 400 | PASS | round4 证据保持成立（`400 invalid_parameter`） |
| 7 | totalCostUsd 精度差 < 1e-12 | BLOCKED | 本轮环境无模板测试运行样本（`template_test_runs` 为空），未形成“10 步 execute + DB 对账”证据链 |
| 8 | waitForCallLog ≤1s/step 或事务直出 | PASS* | 代码证据：`CALL_LOG_POLL_MAX_ATTEMPTS=10` |
| 9 | Lighthouse A11y ≥ 98 | PASS | round4 证据：认证态 `/dashboard`=`100` |
| 10 | error.tsx zh-CN 中文 | BLOCKED | 本轮仍未找到可稳定触发 `(console)/error.tsx` 的动态路径 |
| 11 | admin/models zh-CN Free/Degraded 中文 | PASS | 动态截图与文本匹配均通过 |
| 12 | notification-center zh-CN 相对时间中文 | PASS | 动态截图提取到 `1分钟前`、`2小时前` |
| 13 | admin/operations 硬编码 hex/rgb=0 | PASS | round4 证据保持成立 |
| 14 | dashboard + admin/logs 颜色类违规=0 | PASS | round4 证据保持成立 |
| 15 | 视觉回归无明显差异 | PASS | 基线 `6ed6f66` 对比当前 `31df6b4`，3 页面无肉眼明显差异 |
| 16 | npm run build 通过 | PASS | `codex-setup.sh` 构建通过 |
| 17 | npx tsc --noEmit 通过 | PASS | build 阶段类型检查通过 |
| 18 | npx vitest run 全过 | PASS | round4 证据：`116/116` |
| 19 | 生成 signoff | BLOCKED | #7/#10 仍 BLOCKED，不满足签收条件 |

> `PASS*`：基于代码证据成立，未补新增动态场景。

## 新增关键证据（round5）

1. 动态证据汇总 JSON  
   - `docs/test-reports/perf-raw/bl-fe-quality-round5-dynamic-evidence-2026-04-19.json`

2. `#11` admin/models i18n  
   - `docs/test-reports/perf-raw/bl-fe-quality-round5-admin-models-zh-2026-04-19.png`  
   - 结果：`免费`、`降级` 均命中

3. `#12` notification-center 相对时间 i18n  
   - `docs/test-reports/perf-raw/bl-fe-quality-round5-notifications-zh-2026-04-19.png`  
   - 提取文本：`1分钟前`、`2小时前`

4. `#15` 视觉对照（baseline vs current）  
   - Dashboard：  
     `docs/test-reports/perf-raw/bl-fe-quality-round5-dashboard-baseline-6ed6f66-2026-04-19.png`  
     `docs/test-reports/perf-raw/bl-fe-quality-round5-dashboard-zh-2026-04-19.png`
   - Admin Operations：  
     `docs/test-reports/perf-raw/bl-fe-quality-round5-admin-operations-baseline-6ed6f66-2026-04-19.png`  
     `docs/test-reports/perf-raw/bl-fe-quality-round5-admin-operations-current-2026-04-19.png`
   - Admin Logs：  
     `docs/test-reports/perf-raw/bl-fe-quality-round5-admin-logs-baseline-6ed6f66-2026-04-19.png`  
     `docs/test-reports/perf-raw/bl-fe-quality-round5-admin-logs-current-2026-04-19.png`

## 结论

本轮复验后，BLOCKED 项从 `#7/#10/#11/#12/#15` 收敛为 `#7/#10`。  
当前仍 **不能 signoff**，建议状态维持 `fixing`，待补齐：

1. `#7`：10 步 execute 运行与 `sum(callLog.sellPrice)` 精度对账。  
2. `#10`：`(console)/error.tsx` 的稳定动态触发与中文截图证据。
