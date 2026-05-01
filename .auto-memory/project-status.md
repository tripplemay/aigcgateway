---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-ADMIN-ALIAS-UX-PHASE1**（fixing，2026-05-01 Codex 首轮验收失败）
  - 实现面基本通过：reorder 错位修复 + optimistic handlers + 服务端分页/过滤 + 单测/构建
  - 阻断项在 F-AAU-09 设计稿同步：
    - `design-draft/admin-model-aliases/screen.png` 未刷新
    - `code.html` 含 page-size selector，但真实 UI 没有该控件
  - report: `docs/test-reports/BL-ADMIN-ALIAS-UX-PHASE1-verifying-2026-05-01.md`

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

## 生产旁路修复（2026-04-30 已执行）
- alias claude-opus-4.7/claude-sonnet-4.6 model.enabled 已改 true
- 4 个 alias sellPrice 已补（claude-opus-4.7 / gpt-4o / kimi-k2.5 / kimi-k2.6）
