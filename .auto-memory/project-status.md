---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-SEC-POLISH：`reverifying`**（fix_rounds=1；Planner 裁决 #1/#14 修订 acceptance，Generator 修 #13 脚本 bug）
- Path A 进度 9/11

## round 1 fix（2026-04-19 23:12）
- Planner 裁决（docs/adjudications/BL-SEC-POLISH-adjudication-request-2026-04-19.md）：#1/#14 方案 A，修订 acceptance，代码不动
- Generator 修 #13：setup-zero-balance 脚本 balance 字段从 Project → User（schema 原设计）+ apiKey projectId → userId；端到端 smoke 跑通
- 本地 tsc / vitest 165/165 / build 全过
- 新增 framework 流程：Generator 裁决申请（落盘 docs/adjudications/），待 done 阶段同步到 harness-template

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
