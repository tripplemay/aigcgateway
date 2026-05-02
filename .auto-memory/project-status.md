---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-SYNC-INTEGRITY-PHASE1**（verifying，2026-05-02 generator 完成 3/4）
  - F-SI-01 reconcile 跳过 IMAGE channel 创建（修复 DB CHECK 23514 + 配套 ProviderSyncResult.skippedImageChannels 字段）
  - F-SI-02 xiaomi-mimo sync adapter（curl 验证 OpenAI shape → ADAPTERS 注册，name 前缀 xiaomi/，filterModel=isChatModality 丢 4 TTS）
  - F-SI-03 read-only 扫描脚本 scan-zero-price-channels.ts（stdout + JSON + CSV，docker smoke 通过）
  - F-SI-04 等 Codex 验收（含 dev DB sync xiaomi-mimo + 生产软验收 lastSyncResult=success）
  - spec: docs/specs/BL-SYNC-INTEGRITY-PHASE1-spec.md

## reference path
- KOLMatrix repo 实际路径：`/mnt/c/Users/tripplezhou/projects/kolmatrix`

## 上一批次
- BL-ADMIN-ALIAS-UX-PHASE1 @ 2026-05-01（done，fix_rounds=1）— admin/model-aliases UX 大修：reorder 错位修复 + 6 类 optimistic + 服务端分页 + 设计稿同步
- BL-HEALTH-PROBE-MIN-TOKENS @ 2026-05-01（done，fix_rounds=0）— probe max_tokens 1→16 + 软停 ~openai/gpt-latest + audit-log drift cleanup
- BL-ALIAS-MODEL-CASCADE-ENABLE @ 2026-05-01（done，fix_rounds=0）

## Backlog（4 条，按优先级）
- **BL-SEC-PAY-DEFERRED**（critical-deferred）— 支付 webhook 验签 + 幂等 CAS
- **BL-SEC-INFRA-GUARD-FOLLOWUP**（high-deferred）— Next.js 16 跨大版本迁移
- **BL-SYNC-INTEGRITY-PHASE2**（待评审）— 311 zero-price ACTIVE channel 处置策略（依据 PHASE1 扫描报告分组制定 DISABLED / 补价 / DELETE）
- **BL-FE-DS-SHADCN**（low-deferred）— shadcn 采用率提升

## proposed-learnings
- 已同步 harness-template v0.9.8（7 条累计：铁律 1.5 + 1.5 范围细化 + 1.6 + 1.7 + 1.8 + 3 + Generator manual 归属）

## 生产旁路修复（2026-04-30 已执行）
- alias claude-opus-4.7/claude-sonnet-4.6 model.enabled 已改 true
- 4 个 alias sellPrice 已补（claude-opus-4.7 / gpt-4o / kimi-k2.5 / kimi-k2.6）
