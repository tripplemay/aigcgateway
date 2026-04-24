# BL-BILLING-AUDIT-EXT-P1 复验报告（reverifying / 2026-04-24 round1）

- 批次：`BL-BILLING-AUDIT-EXT-P1`
- 阶段：`reverifying`
- 执行人：Codex / Reviewer
- 触发：生产已部署 fix-round-1（fetcher 三处缺陷修复）后复验

## 结论

- 结论：**未签收（仍需 fixing）**
- 本轮复验通过：#1-#10、#12、#13、#14、#15、#16、#17
- 本轮复验失败：#11（生产 seedream-3 调用后 `call_logs.costPrice` 仍为 `0`）
- 由于 #11 未通过，#18（signoff）继续阻断

## 验收项判定（F-BAX-07 / 18 项）

1. build：PASS（本地复验）
2. tsc：PASS（本地复验）
3. vitest：PASS（`284/284`）
4. migration dry-run：PASS（`prisma migrate diff` 输出 SQL 正常）
5. 新增单测 >= 15：PASS（当前累计测试 `284`）
6. admin check 写 `source='admin_health'`：PASS（沿用首轮证据）
7. admin probe 写 `source='admin_health'`：PASS（沿用首轮证据）
8. `source='probe'`：PASS（沿用首轮证据）
9. run-inference 写 `source='sync'`：PASS（沿用首轮证据）
10. failover `attempt_chain`：PASS（沿用首轮证据）
11. 生产 seedream-3 `costPrice > 0`：**FAIL**（实测成功返回图片但 `costPrice=0`）
12. sanitizeErrorMessage 规则：PASS（沿用首轮证据）
13. volcengine fetcher：PASS（`records=118`，`modelName` 非空）
14. openrouter fetcher：PASS（`records=62`，日期解析无报错）
15. chatanywhere fetcher：PASS（`records=0`，但不报错，符合“可为空数组”口径）
16. 24h 无新增 `sync fallback exhausted` / crash：PASS（关键词计数均 `0`）
17. 24h `call_logs` source 分组：PASS（`probe=132`, `sync=15`, `admin_health=0`）
18. signoff：**BLOCKED**（被 #11 失败阻断）

## 关键证据

- fetcher 生产复验（#13/#14/#15）：
  - `docs/test-reports/artifacts/bl-billing-audit-ext-p1-reverifying-2026-04-24/fetchers-prod-2026-04-22.log`
- seedream-3 生产实测（#11）：
  - `docs/test-reports/artifacts/bl-billing-audit-ext-p1-reverifying-2026-04-24/seedream-prod-check.log`
  - 结果：HTTP 200，`traceId=trc_p2c4qf...`，`call_logs.costPrice="0"`
- 24h source 分组（#17）：
  - `docs/test-reports/artifacts/bl-billing-audit-ext-p1-reverifying-2026-04-24/calllogs-source-24h.json`
- PM2 日志与关键词计数（#16）：
  - `docs/test-reports/artifacts/bl-billing-audit-ext-p1-reverifying-2026-04-24/pm2-aigc-gateway-logs.txt`
  - `docs/test-reports/artifacts/bl-billing-audit-ext-p1-reverifying-2026-04-24/pm2-keyword-counts.json`
  - `docs/test-reports/artifacts/bl-billing-audit-ext-p1-reverifying-2026-04-24/pm2-jlist.json`
- 本地基线（#1/#2/#3/#4）：
  - `docs/test-reports/artifacts/bl-billing-audit-ext-p1-reverifying-2026-04-24/build.local.log`
  - `docs/test-reports/artifacts/bl-billing-audit-ext-p1-reverifying-2026-04-24/tsc.local.log`
  - `docs/test-reports/artifacts/bl-billing-audit-ext-p1-reverifying-2026-04-24/vitest.local.log`
  - `docs/test-reports/artifacts/bl-billing-audit-ext-p1-reverifying-2026-04-24/prisma-migrate-diff.sql`

## 未通过项说明

- #11 FAIL 根因（数据配置层）：
  - 生产库 `seedream-3` 对应 channel（`id=cmnpquy5m00rwbnxcc0omrhet`）当前 `costPrice={unit:'call', perCall:0}`。
  - 在该配置下，即使图片调用成功，`call_logs.costPrice` 仍落 `0`，不满足 >0 验收门槛。
- 下一步建议：
  - Generator/Planner 在生产配置层修正 `seedream-3` 渠道 `costPrice.perCall` 后，再次触发 #11 复验。
