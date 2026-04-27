---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-EMBEDDING-MVP：`verifying`**（Embedding modality 接入完成，KOLMatrix dogfood 需求）
- F-EM-01~05 commits 58ad53c/3382b35/7b90ded/4132d85/9697249；tsc + build + vitest 505 + sdk build 全过
- 关键发现：/v1/models 走 ModelAlias，seed 须同时建 alias 否则 ?modality=embedding 返空（已处理）
- admin/models 页面是 read-only list 无 creation form，spec acceptance #3 N/A
- F-EM-06 验收待 Codex（生产实证需重创 admin API key + 部署 prisma migrate deploy → db seed → bge-m3 调用）

## Phase 2 显式排除
- dimensions 可选 / encoding_format / cosine endpoint / 持久化向量 / Volcengine+Zhipu+DeepSeek 适配 / Template 编排 / Action 批量

## 上一批次（已 done）
- BL-RECON-FIX-PHASE2（OR image-via-chat 治本，Usage.upstreamCostUsd）@ 2026-04-27 fix_round 0
- 2 条 proposed-learnings 待用户在下次 done 阶段批量同步

## Backlog（仅 deferred）
- BL-SEC-INFRA-GUARD-FOLLOWUP / BL-FE-DS-SHADCN / BL-SEC-PAY-DEFERRED

## 生产前置
- 部署需跑 `npx prisma migrate deploy`（migration 含 enum 变更 + Action.modality 字段）+ `npx prisma db seed`（写入 2 个 embedding model）
- F-EM-06 生产实证 1 次真实 bge-m3 调用 ~$0.000004（50 token × $0.07/M）
