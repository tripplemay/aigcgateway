# Balance User-Level Backend Verification — 2026-04-08

## 环境
- Codex L1 stack via `scripts/test/codex-setup.sh` on macOS (Apple Silicon)
- Service URL: http://localhost:3099
- DB: PostgreSQL `aigc_gateway_test`
- Redis: local default

> 注意：`scripts/test/codex-setup.sh` 无法完成执行，详见【已知问题 1】。后续测试基于手动应用 migration + `npx prisma db seed` + `npm run build` + `node .next/standalone/server.js` 的方式继续进行。

## 测试资产
1. `docs/test-cases/balance-user-level-backend-local-test-cases-2026-04-08.md`
2. `scripts/test/balance-user-level-e2e-2026-04-08.ts`
3. `tests/e2e/balance-user-level-ui.spec.ts`（Playwright WebKit）

## 执行记录
| 顺序 | 资产 | 结果 | 备注 |
| --- | --- | --- | --- |
| 1 | `bash scripts/test/codex-setup.sh`（2026-04-08 早） | FAIL | Migration `20260408010000_balance_user_level` 无法应用（见旧问题 1） |
| 2 | 手动执行 migration + seed + build + start | PASS (workaround) | 详见上一轮报告 |
| 3 | `npx tsx scripts/test/balance-user-level-e2e-2026-04-08.ts` | PASS | 生成 `docs/test-reports/balance-user-level-e2e-2026-04-08.json`（旧数据） |
| 4 | `npx playwright test tests/e2e/balance-user-level-ui.spec.ts --browser=webkit` | PASS | 生成 `docs/test-reports/balance-user-level-ui-playwright-report.json`（旧数据） |
| 5 | `bash scripts/test/codex-setup.sh`（2026-04-08 晚，包含 fix） | PASS | migration 全量回放成功，无需手动 DROP |
| 6 | `npx tsx scripts/test/balance-user-level-e2e-2026-04-08.ts` | PASS | 生成最新报告（同路径，已覆盖） |
| 7 | `BASE_URL=http://localhost:3099 npx playwright test … --browser=webkit` | PASS | 生成最新 JSON 报告（已覆盖） |

## 结果概要
- ✅ 多项目余额一致性 + 扣费联动：脚本步骤 `shared balance`、`deduction via chat completion` 均 PASS，最终余额同步。
- ✅ 交易明细过滤：API `GET /api/projects/:id/transactions` 表现符合预期（项目 A 有扣费，项目 B 空列表）。
- ✅ Admin 充值同步用户余额：脚本 `admin recharge affects all projects` PASS。
- ✅ MCP `get_balance` Tool：返回用户级余额与 REST API 一致，交易列表按项目过滤。
- ✅ 控制台 Sidebar 钱包：Playwright 用例 `F-BU-08 Sidebar wallet remains constant when switching projects` 在 WebKit PASS。
- ✅ Migration 复验：`bash scripts/test/codex-setup.sh` 一次性完成 full migrate + seed + build，无需额外 SQL。

## 已知问题
- **当前无阻塞**。Migration 通过在 SQL 内显式 `DROP FUNCTION ...` → `CREATE FUNCTION ...` 已恢复可重复执行，自动化脚本亦保持稳定。

## 结论
- F-BU-01 ~ F-BU-08：全部 PASS。
- 新建 signoff 后，可将进度置为 `done`。
