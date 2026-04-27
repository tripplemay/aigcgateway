---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-EMBEDDING-MVP：`fixing` (fix_round 2)**（生产 2 个 embedding channel 都 DEGRADED）
- 根因：`src/lib/health/checker.ts:56,260` + `scheduler.ts:138,282,314` 多处 isImage 硬编码 → EMBEDDING 走 default chat probe → 上游 400 → 自动降级
- 这是 BL-EMBEDDING-MVP 原 spec 范围漏洞（F-EM-01 加 modality enum 时没扫健康探测路径）
- F-EM-01~05 单测全 PASS（505 tests）；漏的是 modality 反向消费点

## fix-round 2 待办（Generator）
- checker.ts runCallProbe + runTextCheck modality switch（EMBEDDING 调 adapter.embeddings({input:'hi'})）
- scheduler.ts shouldCallProbeChannel 等多处 isImage 改 modality helper
- 单测覆盖 EMBEDDING probe case
- 部署后 SSH SQL UPDATE channels SET status='ACTIVE'（双轨解锁 + probe 长期修）
- 完成后 status fixing → reverifying，Codex 跑 F-EM-06 14 项

## Phase 2 显式排除（不变）
- dimensions / encoding_format / cosine endpoint / 持久化向量 / 其他 provider / Template embedding step / Action 批量

## 上一批次（已 done）
- BL-RECON-FIX-PHASE2（OR image-via-chat 治本）@ 2026-04-27

## Backlog（仅 deferred）
- BL-SEC-INFRA-GUARD-FOLLOWUP / BL-FE-DS-SHADCN / BL-SEC-PAY-DEFERRED

## 生产前置
- ✅ migrate deploy 已跑（enum + Action.modality）；seed 走独立 `scripts/seed-embedding-models.ts`
- fix-round-2 部署后需 SQL 解锁 channel 状态
- F-EM-06 acceptance #13 实证 1 次真实 bge-m3 调用 ~$0.000004
