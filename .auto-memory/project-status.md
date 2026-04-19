---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-INFRA-RESILIENCE：`verifying`**（Generator 3/3 done，等 Codex F-IR-04 15 项）
- Path A 进度 8/11

## 上一批次（BL-DATA-CONSISTENCY done）
- 16/16 PASS，fix_rounds=0 一次过
- 产物：4 处 schema 索引/FK/expiresAt + listPublicTemplates DB 分页 + notifications TTL cron

## 本批次交付（Generator）
- **fetchWithTimeout**：helper（非流式 + 流式双 API）+ openai-compat 流式修（修 H-21 body 挂起无超时）+ dispatcher / health-alert 接入 10s
- **stream cancel + rpm Lua**：chat catch 补 reader.cancel + outputStream.cancel 级联；rpmCheck 改 Redis Lua EVAL 消除 TOCTOU
- **N+1 修复**：model-sync reconcile batch（10 新 model ~5 次 DB 往返）+ list-actions versions take:10 + post-process project 查询合并
- 本地 checks：tsc / vitest 146/146（+12）/ build 全过

## Framework 提案池（1 条未消化）
- Next.js App Router 私有目录约定（来源 BL-FE-QUALITY）

## Framework 铁律（v0.7.3 已采纳）
1. Planner spec 涉及代码细节 Read 源码 + file:line 引用
1.1. acceptance 的"实现形式"与"语义意图"分离
2. Code Review 断言按线索，源码+生产数据双路核实
2.1. 协议返回形式断言标明协议层

## 生产状态
- HEAD `16d1755`（BL-DATA-CONSISTENCY signoff 后）
- 8 批 Path A 代码待用户触发 deploy

## Path A 剩余路线
- P1：INFRA-RESILIENCE ← verifying
- P2：SEC-POLISH 1.5d / INFRA-ARCHIVE 1d / FE-DS-SHADCN 2d
- 延后：INFRA-GUARD-FOLLOWUP 2-3d / BL-FE-QUALITY-FOLLOWUP / PAY-DEFERRED 1-2d
