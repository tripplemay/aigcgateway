---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- AUDIT-FOLLOWUP-2：`fixing`（10 条功能，7 PASS / 1 PARTIAL / 1 FAIL / 1 NOT_VERIFIED）
- 规格：`docs/specs/AUDIT-FOLLOWUP-2-spec.md`
- Generator: Richard 完成 F-AF2-01~09，待修 F-AF2-04 + F-AF2-09
- F-AF2-04 FAIL：list-logs.ts + get-log-detail.ts Prisma capabilities 查询路径错误（tsc 编译失败）
- F-AF2-09 PARTIAL：缺少 batchId 实现
- F-AF2-10 NOT_VERIFIED：生产 API key 过期，本地 DB 空

## 部署前注意
- 新增 migration: `20260416_fix_template_step_order_base`（幂等性问题：constraint 已存在时会报错）
- 需执行 `npx prisma migrate deploy && npx prisma generate`

## 生产状态
- 2026-04-16 运维修复：火山引擎 7 channel realModelId → ep-ID + 8 旧模型 disabled
- deepseek-v3 / doubao-pro 已恢复
- USAGE-ALERTS 待部署

## 已知 gap
- 5 个图片模型 supportedSizes 规则不匹配
- 生产 API key 需要更新（codex-admin / codex-dev 均 401）

## 已完成批次
- R1~R4 / P5 / M1a~M1d / BF / K1 / U1 / L1 / MCP2 / A1 / T1 / N1 / O1 / CI1 / SUP1 / P6 / DQ2 / ADMIN-UX / BF2 / ADMIN-OPS+ / BL-080 / BF3 / PRICE-FIX / BF4 / BILLING-REFACTOR / AUDIT-SEC / DX-POLISH / UI-UNIFY / DOCS-REFRESH / UI-UNIFY-FIX / AUDIT-CRITICAL-FIX / RATE-LIMIT / WORKFLOW-POLISH / AUDIT-FOLLOWUP / UI-UNIFY-FIX-2 / ADMIN-UI-UNIFY / ADMIN-OPS++ / REGRESSION-BACKFILL / USAGE-ALERTS
