---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-SYNC-INTEGRITY-PHASE2**（done，2026-05-02 启动，fix_rounds=1）— 软停 259 disabled-alias-only channel + sync-status 度量重定义（alias 层）+ admin chip + scan 三维扩展；4 features (3 generator + 1 codex)
  - 数据来源：PHASE1 生产 scan SSH 真跑（310 行精准三维分组）；spec: docs/specs/BL-SYNC-INTEGRITY-PHASE2-spec.md
  - Codex 复验通过：`unpricedActiveAliases` 现已正确统计 SQL NULL / JSON null / `{}` sellPrice；admin alias-level warning chip 可随度量显现

## reference path
- KOLMatrix repo 实际路径：`/mnt/c/Users/tripplezhou/projects/kolmatrix`

## 上一批次
- BL-SYNC-INTEGRITY-PHASE1 @ 2026-05-02（done，fix_rounds=0）— siliconflow IMAGE skip + xiaomi-mimo adapter + 311 zero-price 扫描脚本；main 已部署生产
- BL-ADMIN-ALIAS-UX-PHASE1 @ 2026-05-01（done，fix_rounds=1）— admin/model-aliases UX 大修
- BL-HEALTH-PROBE-MIN-TOKENS @ 2026-05-01（done，fix_rounds=0）— probe max_tokens 1→16

## Backlog（4 条，按优先级）
- **BL-SEC-PAY-DEFERRED**（critical-deferred）— 支付 webhook 验签 + 幂等 CAS
- **BL-SEC-INFRA-GUARD-FOLLOWUP**（high-deferred）— Next.js 16 跨大版本迁移
- **BL-FE-DS-SHADCN-MINI-A**（medium）— shadcn 渗透 3 高频 admin 页（depends_on PHASE2 done）
- **BL-FE-DS-SHADCN**（low-deferred）— shadcn 大批量采用率提升（剩余 15+ 文件）

## proposed-learnings
- 已同步 harness-template v0.9.9（8 条累计：铁律 1 内部命名 grep + 1.5 + 1.5 范围细化 + 1.6 + 1.7 + 1.8 + 3 + Generator manual 归属）

## 生产旁路修复（2026-04-30 已执行）
- alias claude-opus-4.7/claude-sonnet-4.6 model.enabled 已改 true
- 4 个 alias sellPrice 已补（claude-opus-4.7 / gpt-4o / kimi-k2.5 / kimi-k2.6）
