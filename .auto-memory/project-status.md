---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-SEC-POLISH：`fixing`**（Codex 首轮验收：15 PASS / 2 PARTIAL / 1 FAIL）
- Path A 进度 9/11（待本批修复后继续）

## 本轮验收结论（F-SP-04）
- FAIL: #1 `nonexistent+wrong-password <50ms`（实测约 218ms）
- PARTIAL: #14 run_template 限流语义命中，但 MCP 协议层为 HTTP 200 + isError（非严格 429）
- PARTIAL: #13 bcrypt 格式修复生效，但 `setup-zero-balance-test.ts` 在 `project.balance` 字段报错
- 其余 15 项通过（#2-#12、#15-#17）

## 关键产物
- 验收报告：`docs/test-reports/BL-SEC-POLISH-verifying-2026-04-19.md`
- 用例：`docs/test-cases/bl-sec-polish-verifying-cases-2026-04-19.md`
- 证据：`docs/test-reports/artifacts/*2026-04-19*`

## 生产状态
- 生产已部署；本轮为本地 L1 验收判定
- signoff 未生成（存在 FAIL/PARTIAL）

## Path A 剩余路线
- P2：SEC-POLISH（fixing）/ INFRA-ARCHIVE / FE-DS-SHADCN
- 延后候选：INFRA-GUARD-FOLLOWUP / BL-FE-QUALITY-FOLLOWUP / PAY-DEFERRED
