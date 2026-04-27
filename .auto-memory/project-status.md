---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-EMBEDDING-MVP：`reverifying`**（fix_rounds=1）
- Codex round1 FAIL：prod migrate 跑了但 seed 未跑（deploy.yml 设计如此，防覆盖手动 ProviderConfig）→ embedding model_not_found
- fix-round-1 (commit 0aed054): scripts/seed-embedding-models.ts 抽离共享函数，prod SSH 跑通 → /v1/models?modality=embedding 已返 2 条
- 待 Codex F-EM-06 reverify #4-7 API 行为 + #12-13 生产实证（admin API key 仍需重创）

## Phase 2 显式排除
- dimensions 可选 / encoding_format / cosine endpoint / 持久化向量 / Volcengine+Zhipu+DeepSeek 适配 / Template 编排 / Action 批量

## 上一批次（已 done）
- BL-RECON-FIX-PHASE2（OR image-via-chat 治本，Usage.upstreamCostUsd）@ 2026-04-27 fix_round 0
- 2 条 proposed-learnings 待用户在下次 done 阶段批量同步

## Backlog（仅 deferred）
- BL-SEC-INFRA-GUARD-FOLLOWUP / BL-FE-DS-SHADCN / BL-SEC-PAY-DEFERRED

## 生产前置
- ✅ migrate deploy 已跑（enum + Action.modality）；seed 走独立 `scripts/seed-embedding-models.ts`（不全量 db seed 防覆盖）
- F-EM-06 生产实证 1 次真实 bge-m3 调用 ~$0.000004（50 token × $0.07/M）
