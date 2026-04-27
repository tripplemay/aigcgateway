---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-EMBEDDING-MVP：`building`**（Embedding modality 接入，KOLMatrix dogfood 需求，~3.5 day）
- 来源：KOLMatrix 客户 request `/Users/yixingzhou/project/joyce/docs/external-asks/aigcgateway-embedding-request.md`
- 6 features：F-EM-01 schema+adapter / F-EM-02 API+计费 / F-EM-03 Action runner / F-EM-04 seed+UI / F-EM-05 MCP+SDK / F-EM-06 Codex 验收
- 优先 model：bge-m3 (SiliconFlow, KOLMatrix 主推中日韩) + text-embedding-3-small (OpenAI 兜底)
- 时机目标：2026-05-22 前完成（KOLMatrix MVP 上线日期，给 BL-014 升级留 buffer）
- 架构：ModelModality 加 EMBEDDING + Action.modality + adapter.embeddings? + runner 分支
- 计费：input tokens 单边（复用 calculateTokenCost output=0）

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
