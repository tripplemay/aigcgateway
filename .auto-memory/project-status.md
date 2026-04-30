---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-ALIAS-MODEL-CASCADE-ENABLE（status=verifying，交 Codex 验收）**
- 3/3 features done：F-ACE-01 级联 model.enabled、F-ACE-02 暴露 modelEnabled/lastHealthResult、F-ACE-03 UI 徽章+toast
- commits: 2202aad（F-ACE-01/02）、ffa9da8（F-ACE-03）

## reference path
- KOLMatrix repo 实际路径：`/mnt/c/Users/tripplezhou/projects/kolmatrix`

## 上一批次
- BL-TEST-INFRA-IMPORT @ 2026-04-30（done，fix_rounds=3）

## Backlog（4 条，按优先级）
- **BL-HEALTH-PROBE-MIN-TOKENS**（medium）— probe max_tokens=1 不兼容 Azure-backed model
- **BL-SEC-INFRA-GUARD-FOLLOWUP**（high-deferred）— Next.js 16 跨大版本迁移
- **BL-SEC-PAY-DEFERRED**（critical-deferred）— 支付 webhook 验签 + 幂等 CAS
- **BL-FE-DS-SHADCN**（low-deferred）— shadcn 采用率提升

## proposed-learnings
- 全部已同步 harness-template v0.9.6（4 条：铁律 1.5/1.6/1.7/3）

## 生产旁路修复（2026-04-30 已执行）
- alias claude-opus-4.7/claude-sonnet-4.6 model.enabled 已改 true
- 4 个 alias sellPrice 已补（claude-opus-4.7 / gpt-4o / kimi-k2.5 / kimi-k2.6）
