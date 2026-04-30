---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **无进行中批次（BL-TEST-INFRA-IMPORT 已 done @ 2026-04-30，fix_rounds=3）**

## reference path
- KOLMatrix repo 实际路径：`/mnt/c/Users/tripplezhou/projects/kolmatrix`

## 上一批次
- BL-TEST-INFRA-IMPORT @ 2026-04-30（done）/ BL-MCP-PAGE-REVAMP @ 2026-04-28 / BL-EMBEDDING-MVP @ 2026-04-28

## Backlog（5 条，按优先级）
- **BL-ALIAS-MODEL-CASCADE-ENABLE**（medium）— alias 启用未级联 model.enabled + sellPrice 缺失 + health-FAIL 隐藏
- **BL-HEALTH-PROBE-MIN-TOKENS**（medium）— probe max_tokens=1 不兼容 Azure-backed model（gpt-5 永远 FAIL）
- **BL-SEC-INFRA-GUARD-FOLLOWUP**（high-deferred）— Next.js 16 跨大版本迁移
- **BL-SEC-PAY-DEFERRED**（critical-deferred）— 支付 webhook 验签 + 幂等 CAS
- **BL-FE-DS-SHADCN**（low-deferred）— shadcn 采用率提升

## proposed-learnings
- 全部已同步 harness-template v0.9.6（4 条：铁律 1.5/1.6/1.7/3）

## 生产旁路修复（2026-04-30 已执行）
- alias claude-opus-4.7/claude-sonnet-4.6 model.enabled 已改 true
- 4 个 alias sellPrice 已补（claude-opus-4.7 / gpt-4o / kimi-k2.5 / kimi-k2.6）
