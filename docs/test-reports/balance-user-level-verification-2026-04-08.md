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
| 1 | `bash scripts/test/codex-setup.sh` | FAIL | Migration `20260408010000_balance_user_level` 无法应用（见问题 1） |
| 2 | 手动执行 migration + seed + build + start | PASS (workaround) | 详见脚本 `node` 批处理（未纳入产品代码） |
| 3 | `npx tsx scripts/test/balance-user-level-e2e-2026-04-08.ts` | PASS | 生成 `docs/test-reports/balance-user-level-e2e-2026-04-08.json` |
| 4 | `npx playwright test tests/e2e/balance-user-level-ui.spec.ts --browser=webkit` | PASS | 生成 `docs/test-reports/balance-user-level-ui-playwright-report.json` |

## 结果概要
- ✅ 多项目余额一致性 + 扣费联动：脚本步骤 `shared balance`、`deduction via chat completion` 均 PASS，最终余额同步。
- ✅ 交易明细过滤：API `GET /api/projects/:id/transactions` 表现符合预期（项目 A 有扣费，项目 B 空列表）。
- ✅ Admin 充值同步用户余额：脚本 `admin recharge affects all projects` PASS。
- ✅ MCP `get_balance` Tool：返回用户级余额与 REST API 一致，交易列表按项目过滤。
- ✅ 控制台 Sidebar 钱包：Playwright 用例 `F-BU-08 Sidebar wallet remains constant when switching projects` 在 WebKit PASS。

## 已知问题
1. **Migration 无法回放（BLOCKER，影响 F-BU-01 / F-BU-02）**
   - 复现：`bash scripts/test/codex-setup.sh` 或 `npx prisma migrate deploy`
   - 报错：
     ```
     Applying migration `20260408010000_balance_user_level`
     Error: P3018 ...
     ERROR: cannot change return type of existing function
     HINT: Use DROP FUNCTION deduct_balance(text,numeric,text,text,text) first.
     ```
   - 影响：无法把 `users.balance` / `transactions.userId` / 新版 `deduct_balance`、`check_balance` 应用到全新环境，也就无法完成 L1 验证。当前轮测试只能通过手动执行 SQL（先 DROP 再 CREATE）进行 workaround。
   - 推断：migration 中使用 `CREATE OR REPLACE FUNCTION` 改变返回类型，PostgreSQL 不允许；需要在 migration 开头显式 `DROP FUNCTION ...` 再 `CREATE FUNCTION ...`。

2. **`scripts/test/balance-user-level-e2e-2026-04-08.ts` 需要等待异步扣费**
   - 已通过引入 `expectSharedBalanceChange()` 轮询 6s 内的变动修复（commit 内可见），否则扣费尚未落库时会出现假阴性。

## 结论
- F-BU-01 / F-BU-02：FAIL（migration 无法执行，属于阻塞问题）。
- 其余 F-BU-03 ~ F-BU-08：依据现有脚本和 UI 测试全部 PASS。
- 总体状态：`fixing`。
