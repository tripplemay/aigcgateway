# K1-apikey-user-level Signoff 2026-04-10

## 结论
- Signoff: **PASS**
- 批次：`K1-apikey-user-level`
- 目标 Feature：`F-K1-08`
- 环境：L1 本地 `http://localhost:3099`
- 复验时间：`2026-04-10T04:57:26.609Z`

## 验收结果
- AC1：PASS（Key 调 chat 成功，且余额从 `20` 扣到 `19.99999712`）
- AC2：PASS（同一 Key 通过 `X-Project-Id` 成功访问两个项目的 Actions）
- AC3：PASS（无项目上下文时 chat 返回 `200`，actions 返回 `400`）
- AC4：PASS（`/api/keys` 用户级 Key 管理可创建并列出）
- AC4b：PASS（旧 `/api/projects/:id/keys` 路径返回 `404`）
- AC5：PASS（新充值路径返回 `201`，旧路径返回 `404`）
- AC6：PASS（MCP initialize 与 tools/list 均返回 `200`）

总计：`7 PASS / 0 FAIL`

## 关键证据
- 复验脚本结果：[k1-apikey-user-level-verifying-e2e-2026-04-10.json](/Users/yixingzhou/project/aigcgateway/docs/test-reports/k1-apikey-user-level-verifying-e2e-2026-04-10.json)
- 本地签收报告：[k1-apikey-user-level-signoff-2026-04-10.md](/Users/yixingzhou/project/aigcgateway/docs/test-reports/k1-apikey-user-level-signoff-2026-04-10.md)
- 被测脚本：[k1-apikey-user-level-verifying-e2e-2026-04-10.ts](/Users/yixingzhou/project/aigcgateway/scripts/test/k1-apikey-user-level-verifying-e2e-2026-04-10.ts)

## 备注
- 本轮执行时需要加载测试环境变量：`source scripts/test/codex-env.sh && npx tsx scripts/test/k1-apikey-user-level-verifying-e2e-2026-04-10.ts`
- JSON 结果中的 `feature` 字段写为 `F-K1-09`，但当前批次实际验收项是 `F-K1-08`。这不影响业务验收结论，但属于测试产物编号不一致。

## 状态机更新
- `progress.json.status` → `done`
- `progress.json.docs.signoff` → `docs/test-reports/k1-apikey-user-level-signoff-2026-04-10.md`
