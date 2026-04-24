# BL-BILLING-AUDIT-EXT-P1 验收报告（verifying，2026-04-24）

- 批次：`BL-BILLING-AUDIT-EXT-P1`
- 阶段：`verifying`
- 执行人：Codex / Reviewer
- 环境：
  - L1 本地：`http://localhost:3099`（`scripts/test/codex-setup.sh` 前台启动）
  - DB：`postgresql://test:test@localhost:5432/aigc_gateway_test`

## 结论

- 当前结论：**未签收（BLOCKED）**
- 本地可验证项已完成并通过；生产依赖项（真实上游凭证、充值、24h 观察窗口）未满足，无法完成 #11/#13/#14/#15/#16/#17/#18。
- 建议状态流转：`verifying -> fixing`（等待 Generator/Planner 补齐生产条件或调整验收口径后进入 `reverifying`）。

## 验收项逐条判定（F-BAX-07 / 18 项）

1. `npm run build`：**PASS**
2. `npx tsc --noEmit`：**PASS**
3. `npx vitest run`：**PASS**（`272/272`）
4. Prisma migration dry-run：**PASS**（已执行 `prisma migrate diff`，产出 SQL）
5. 新增单测总数 >= 15：**PASS**（BAX 相关测试用例计数 `38`）
6. `/api/admin/health/:id/check` 写 `source='admin_health'` 且 `projectId/userId=null`：**PASS**
7. `/api/admin/health/:id/probe` 同上：**PASS**
8. 产出 `source='probe'` call_log：**PASS**（通过调度器同路径 `checkChannel(..., 'probe')` 手动触发）
9. `POST /api/admin/run-inference` 产出 `source='sync'`：**PASS**
10. `/v1/chat/completions` failover `attempt_chain` 对齐：**PASS**（`attempt_chain` 长度 `2`）
11. 生产 seedream-3 `costPrice > 0`：**BLOCKED**（需生产充值与真实调用）
12. `sanitizeErrorMessage('前往 https://example.com 充值')` 规则：**PASS**
13. volcengine fetcher 真实账单拉取：**BLOCKED**（缺生产 billing AK/SK）
14. openrouter fetcher 真实账单拉取：**BLOCKED**（缺生产 provisioning key）
15. chatanywhere fetcher 真实账单拉取：**BLOCKED**（缺生产 apiKey）
16. 生产 24h 无 crash / 无 `sync fallback exhausted`：**BLOCKED**（需生产 24h 观察窗口）
17. 生产 `call_logs` source 分组统计符合预期：**BLOCKED**（需生产数据窗口）
18. signoff 报告：**BLOCKED**（存在 6 项 BLOCKED，未达签收条件）

## 核心证据

- 构建日志：`docs/test-reports/artifacts/bl-billing-audit-ext-p1-verifying-2026-04-24/build.log`
- 类型检查日志：`docs/test-reports/artifacts/bl-billing-audit-ext-p1-verifying-2026-04-24/tsc.log`
- 单测日志：`docs/test-reports/artifacts/bl-billing-audit-ext-p1-verifying-2026-04-24/vitest.log`
- migration diff：`docs/test-reports/artifacts/bl-billing-audit-ext-p1-verifying-2026-04-24/prisma-migrate-diff.sql`
- BAX 测试计数：`docs/test-reports/artifacts/bl-billing-audit-ext-p1-verifying-2026-04-24/bax-test-counts.tsv`
- 本地动态证据（#6/#7/#8/#9/#10/#12）：`docs/test-reports/artifacts/bl-billing-audit-ext-p1-verifying-2026-04-24/local-dynamic-evidence.json`
- 执行脚本：`scripts/test/bl-billing-audit-ext-p1-verifying-2026-04-24.ts`

## BLOCKED 明细（需补充条件）

- #11：在生产手动触发 `seedream-3` 图片请求，且上游账户已充值，验证 `call_logs.costPrice > 0`。
- #13/#14/#15：在生产 DB 的 `providers.authConfig` 填入真实凭证后执行：
  - `npx tsx scripts/test-billing-fetchers.ts volcengine 2026-04-22`
  - `npx tsx scripts/test-billing-fetchers.ts openrouter 2026-04-22`
  - `npx tsx scripts/test-billing-fetchers.ts chatanywhere 2026-04-22`
- #16/#17：生产部署后观察至少 24h，再补日志与统计证据。
