---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-SEC-INFRA-GUARD：`verifying`**（Generator 6/7 交付，等 Codex F-IG-07 跑 14 项验收）
- Path A 进度 4/14.5，完成后进入 FE-PERF-01

## 本批次产物（6 commits）
- F-IG-03 stress-test spawnSync（172ba68）
- F-IG-04 MCP 权限 + IP 白名单显式对齐 + auth.test.ts（23887ab）
- F-IG-05 checkBalanceAlerts Redis NX 日去重（f9d345f）
- F-IG-02 Redis leader-lock.ts + instrumentation/health/model-sync 改造 + 7 单测（4c4bd68）
- F-IG-01 admin-schemas.ts 6 zod schemas + 6 handler + httpUrl refine + 8 单测（17f25e1）
- F-IG-06 npm audit fix 非破坏性 7/8（de3e6f4）
- 本地：tsc / build / vitest 115/115 全绿

## 本批次留尾
- F-IG-06 剩余 1 high（next@14.2.35，全 14.x/15.x 未修，只有 16.2.4 修复跨大版本 breaking）→ 建议新建 BL-SEC-INFRA-GUARD-FOLLOWUP Next.js 16 迁移
- F-IG-02 多副本 scheduler 手工验证留给 Evaluator L2 环境做

## 生产状态
- HEAD `e45d469`（BILLING-CHECK-FOLLOWUP signoff 后）
- 已部署：CRED-HARDEN / AUTH-SESSION / BILLING-AI F-BA-01+02 / BILLING-CHECK-FOLLOWUP v2 CHECK
- INFRA-GUARD 待 Evaluator 签收后部署

## Framework 新增铁律（2026-04-18）
1. Planner 写 spec 涉及代码细节必须 Read 源码 + file:line 引用
2. Code Review 报告的符号/类型/约束断言按"线索"不按"真相"，必须源码+生产数据双路核实

## Path A 执行路线图
- P0 安全：CRED-HARDEN ✅ / AUTH-SESSION ✅ / BILLING-AI ✅ / BILLING-CHECK-FOLLOWUP ✅ / INFRA-GUARD ← verifying
- 可能新增：INFRA-GUARD-FOLLOWUP（Next.js 16 迁移）
- P0 前端：FE-PERF-01
- P1 / P2 批次不变
- 延后：PAY-DEFERRED

## 已知 gap（非阻塞）
- dev DB migrate drift（pre-existing）
- 5 个图片模型 supportedSizes / get-balance.ts TS2353 / landing.html href="#" 占位 / CI secrets / jose Edge warning
