---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-ADMIN-ALIAS-UX-PHASE1**（done，2026-05-01 Codex reverifying PASS）
  - F-AAU-01..08：实现面已在 verifying 通过（含 dev-server runtime 验收）
  - F-AAU-09：design-draft 三件已同步 PASS：code.html 去除 pageSize selector、screen.png 刷新为真实页面截图、DESIGN.md 同步分页说明
  - signoff: `docs/test-reports/BL-ADMIN-ALIAS-UX-PHASE1-signoff-2026-05-01.md`

## reference path
- KOLMatrix repo 实际路径：`/mnt/c/Users/tripplezhou/projects/kolmatrix`

## 上一批次
- BL-HEALTH-PROBE-MIN-TOKENS @ 2026-05-01（done，fix_rounds=0）— probe max_tokens 1→16 + 软停 ~openai/gpt-latest + audit-log drift cleanup
- BL-ALIAS-MODEL-CASCADE-ENABLE @ 2026-05-01（done，fix_rounds=0）
- BL-TEST-INFRA-IMPORT @ 2026-04-30（done，fix_rounds=3）

## Backlog（3 条，按优先级）
- **BL-SEC-PAY-DEFERRED**（critical-deferred）— 支付 webhook 验签 + 幂等 CAS
- **BL-SEC-INFRA-GUARD-FOLLOWUP**（high-deferred）— Next.js 16 跨大版本迁移
- **BL-FE-DS-SHADCN**（low-deferred）— shadcn 采用率提升

## proposed-learnings
- 已同步 harness-template v0.9.7（5 条累计：铁律 1.5 + 1.5 范围细化 + 1.6 + 1.7 + 3）
- 待确认（1 条）：Generator 不应把 manual screenshot 类任务甩锅给 Codex（来源 BL-ADMIN-ALIAS-UX-PHASE1 verifying FAIL）

## 生产旁路修复（2026-04-30 已执行）
- alias claude-opus-4.7/claude-sonnet-4.6 model.enabled 已改 true
- 4 个 alias sellPrice 已补（claude-opus-4.7 / gpt-4o / kimi-k2.5 / kimi-k2.6）
