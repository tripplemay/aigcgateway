---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-INFRA-RESILIENCE：`building`**（P1-data 第 2 批，1.5d，4 features：3 generator + 1 codex）
- Path A 进度 8/11（合并后）

## 上一批次（BL-DATA-CONSISTENCY done）
- 16/16 PASS，fix_rounds=0 一次过 🎉
- 产物：4 处 schema 索引/FK/expiresAt + migration 幂等 + listPublicTemplates DB 分页 + notifications TTL cron
- Signoff: `docs/test-reports/BL-DATA-CONSISTENCY-signoff-2026-04-19.md`

## 本批次目标
- fetchWithTimeout helper 统一封装 + 3 处接入（openai-compat 流式修 / dispatcher / health-alert）
- chat stream reader.cancel 补齐所有 catch 分支
- rpmCheck 改 Redis Lua 原子消除 TOCTOU
- N+1 修复 3 处：model-sync reconcile batch / list-actions versions take / post-process Project 缓存

## Framework 提案池（1 条未消化）
- Next.js App Router 私有目录约定（`_`/`__` 前缀不生成 route，来源 BL-FE-QUALITY fix round 5）

## Framework 铁律（v0.7.3 已采纳）
1. Planner spec 涉及代码细节 Read 源码 + file:line 引用
1.1. acceptance 的"实现形式"与"语义意图"分离
2. Code Review 断言按线索，源码+生产数据双路核实
2.1. 协议返回形式断言标明协议层

## 生产状态
- HEAD `32b0f14`（BL-DATA-CONSISTENCY signoff 后）
- 8 批 Path A 代码待用户触发 deploy

## Path A 剩余路线
- P1：INFRA-RESILIENCE ← building
- P2：SEC-POLISH 1.5d / INFRA-ARCHIVE 1d / FE-DS-SHADCN 2d
- 延后候选：INFRA-GUARD-FOLLOWUP（Next.js 16 迁移 2-3d）/ BL-FE-QUALITY-FOLLOWUP
- 延后：PAY-DEFERRED 1-2d
