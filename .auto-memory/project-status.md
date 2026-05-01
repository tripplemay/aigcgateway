---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **无进行中批次**

## reference path
- KOLMatrix repo 实际路径：`/mnt/c/Users/tripplezhou/projects/kolmatrix`

## 上一批次
- BL-HEALTH-PROBE-MIN-TOKENS @ 2026-05-01（done，fix_rounds=0）— probe max_tokens 1→16 + 软停 ~openai/gpt-latest + audit-log drift cleanup（post-process.ts 同源 PROBE_MAX_TOKENS）
- BL-ALIAS-MODEL-CASCADE-ENABLE @ 2026-05-01（done，fix_rounds=0）
- BL-TEST-INFRA-IMPORT @ 2026-04-30（done，fix_rounds=3）

## Backlog（3 条，按优先级）
- **BL-SEC-PAY-DEFERRED**（critical-deferred）— 支付 webhook 验签 + 幂等 CAS
- **BL-SEC-INFRA-GUARD-FOLLOWUP**（high-deferred）— Next.js 16 跨大版本迁移
- **BL-FE-DS-SHADCN**（low-deferred）— shadcn 采用率提升

## proposed-learnings
- 已同步 harness-template v0.9.6（4 条：铁律 1.5/1.6/1.7/3）
- 待确认（1 条）：Planner 铁律 1.5 grep 范围细化（来源 BL-HEALTH-PROBE-MIN-TOKENS F-HPMT-01）

## 生产旁路修复（2026-04-30 已执行）
- alias claude-opus-4.7/claude-sonnet-4.6 model.enabled 已改 true
- 4 个 alias sellPrice 已补（claude-opus-4.7 / gpt-4o / kimi-k2.5 / kimi-k2.6）
